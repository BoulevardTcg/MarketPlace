import type { PrismaClient } from "@prisma/client";

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.listingEvent.deleteMany();
  await prisma.tradeEvent.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.tradeOffer.deleteMany();
  await prisma.userCollection.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.priceAlert.deleteMany();
}
