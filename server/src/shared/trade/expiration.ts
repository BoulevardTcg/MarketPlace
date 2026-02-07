import { TradeOfferStatus, TradeEventType } from "@prisma/client";
import type { TradeOffer } from "@prisma/client";
import { prisma } from "../db/prisma.js";

/**
 * If the offer is PENDING and past its expiresAt, atomically marks it EXPIRED
 * and creates a TradeEvent.EXPIRED with actorUserId = "system".
 * Uses updateMany with status guard to prevent duplicate EXPIRED events
 * when called concurrently.
 * Returns the (possibly updated) offer.
 */
export async function markExpiredIfNeeded(
  offer: TradeOffer,
): Promise<TradeOffer> {
  if (
    offer.status !== TradeOfferStatus.PENDING ||
    !offer.expiresAt ||
    offer.expiresAt >= new Date()
  ) {
    return offer;
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.tradeOffer.updateMany({
      where: { id: offer.id, status: TradeOfferStatus.PENDING },
      data: { status: TradeOfferStatus.EXPIRED },
    });

    // count === 0 means another request already transitioned this offer
    if (count > 0) {
      await tx.tradeEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: TradeEventType.EXPIRED,
          actorUserId: "system",
        },
      });
    }

    return tx.tradeOffer.findUniqueOrThrow({ where: { id: offer.id } });
  });
}

/**
 * Batch-expire all PENDING offers past expiresAt that involve the given user
 * (as creator or receiver). Called lazily before listing trade offers.
 * Uses updateMany with status=PENDING guard to avoid overwriting
 * offers that were concurrently accepted/rejected/cancelled.
 * Only creates EXPIRED events for offers actually transitioned.
 */
export async function expirePendingOffers(userId: string): Promise<void> {
  const now = new Date();
  const candidates = await prisma.tradeOffer.findMany({
    where: {
      status: TradeOfferStatus.PENDING,
      expiresAt: { lt: now },
      OR: [{ creatorUserId: userId }, { receiverUserId: userId }],
    },
    select: { id: true },
  });

  if (candidates.length === 0) return;

  const candidateIds = candidates.map((e) => e.id);

  await prisma.$transaction(async (tx) => {
    // Atomically update only offers still PENDING
    await tx.tradeOffer.updateMany({
      where: { id: { in: candidateIds }, status: TradeOfferStatus.PENDING },
      data: { status: TradeOfferStatus.EXPIRED },
    });

    // Re-query to find which offers were actually transitioned to EXPIRED
    // (avoids creating duplicate events if a concurrent call already expired them)
    const actuallyExpired = await tx.tradeOffer.findMany({
      where: { id: { in: candidateIds }, status: TradeOfferStatus.EXPIRED },
      select: { id: true },
    });

    // Only create events for offers that don't already have an EXPIRED event
    for (const e of actuallyExpired) {
      const existingEvent = await tx.tradeEvent.findFirst({
        where: { tradeOfferId: e.id, type: TradeEventType.EXPIRED },
        select: { id: true },
      });
      if (!existingEvent) {
        await tx.tradeEvent.create({
          data: {
            tradeOfferId: e.id,
            type: TradeEventType.EXPIRED,
            actorUserId: "system",
          },
        });
      }
    }
  });
}
