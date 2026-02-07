import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) =>
  jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

const CREATOR = "creator-user";
const RECEIVER = "receiver-user";

describe("Trade", () => {
  let creatorToken: string;
  let receiverToken: string;

  beforeAll(async () => {
    await prisma.$connect();
    creatorToken = makeToken(CREATOR);
    receiverToken = makeToken(RECEIVER);
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOffer(expiresInHours = 72) {
    const res = await request(app)
      .post("/trade/offers")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        receiverUserId: RECEIVER,
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
        expiresInHours,
      });
    expect(res.status).toBe(201);
    return res.body.data.tradeOfferId as string;
  }

  // ─── Accept / Reject / Cancel ─────────────────────────────────

  it("receiver can accept PENDING offer", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(200);

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    expect(offer!.status).toBe("ACCEPTED");

    const event = await prisma.tradeEvent.findFirst({
      where: { tradeOfferId: offerId, type: "ACCEPTED" },
    });
    expect(event).not.toBeNull();
    expect(event!.actorUserId).toBe(RECEIVER);
  });

  it("receiver can reject offer", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .post(`/trade/offers/${offerId}/reject`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(200);

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    expect(offer!.status).toBe("REJECTED");
  });

  it("creator can cancel offer", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .post(`/trade/offers/${offerId}/cancel`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    expect(offer!.status).toBe("CANCELLED");
  });

  // ─── Permission checks ───────────────────────────────────────

  it("creator cannot accept (403)", async () => {
    const offerId = await createOffer();
    const res = await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(403);
  });

  it("receiver cannot cancel (403)", async () => {
    const offerId = await createOffer();
    const res = await request(app)
      .post(`/trade/offers/${offerId}/cancel`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(403);
  });

  it("third party cannot view offer (403)", async () => {
    const offerId = await createOffer();
    const thirdToken = makeToken("third-party");
    const res = await request(app)
      .get(`/trade/offers/${offerId}`)
      .set("Authorization", `Bearer ${thirdToken}`);
    expect(res.status).toBe(403);
  });

  // ─── Expiration ───────────────────────────────────────────────

  it("accepting expired offer returns 409 and creates EXPIRED event", async () => {
    // Create offer with past expiration directly in DB
    const offer = await prisma.tradeOffer.create({
      data: {
        creatorUserId: CREATOR,
        receiverUserId: RECEIVER,
        creatorItemsJson: { schemaVersion: 1 },
        receiverItemsJson: { schemaVersion: 1 },
        status: "PENDING",
        expiresAt: new Date("2020-01-01"),
      },
    });
    await prisma.tradeEvent.create({
      data: {
        tradeOfferId: offer.id,
        type: "CREATED",
        actorUserId: CREATOR,
      },
    });

    const res = await request(app)
      .post(`/trade/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(409);

    const updated = await prisma.tradeOffer.findUnique({
      where: { id: offer.id },
    });
    expect(updated!.status).toBe("EXPIRED");

    const expiredEvent = await prisma.tradeEvent.findFirst({
      where: { tradeOfferId: offer.id, type: "EXPIRED" },
    });
    expect(expiredEvent).not.toBeNull();
    expect(expiredEvent!.actorUserId).toBe("system");
  });

  it("lazy expiration on list creates EXPIRED event", async () => {
    await prisma.tradeOffer.create({
      data: {
        creatorUserId: CREATOR,
        receiverUserId: RECEIVER,
        creatorItemsJson: { schemaVersion: 1 },
        receiverItemsJson: { schemaVersion: 1 },
        status: "PENDING",
        expiresAt: new Date("2020-01-01"),
      },
    });

    const res = await request(app)
      .get("/trade/offers?type=sent")
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].status).toBe("EXPIRED");

    const event = await prisma.tradeEvent.findFirst({
      where: { type: "EXPIRED" },
    });
    expect(event).not.toBeNull();
    expect(event!.actorUserId).toBe("system");
  });

  // ─── Detail ───────────────────────────────────────────────────

  it("GET /trade/offers/:id returns detail with events", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .get(`/trade/offers/${offerId}`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(offerId);
    expect(res.body.data.events).toBeInstanceOf(Array);
    expect(res.body.data.events[0].type).toBe("CREATED");
  });

  // ─── List ─────────────────────────────────────────────────────

  it("GET /trade/offers?type=sent returns creator's offers", async () => {
    await createOffer();

    const res = await request(app)
      .get("/trade/offers?type=sent")
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].creatorUserId).toBe(CREATOR);
  });

  it("GET /trade/offers?type=received returns receiver's offers", async () => {
    await createOffer();

    const res = await request(app)
      .get("/trade/offers?type=received")
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].receiverUserId).toBe(RECEIVER);
  });

  it("cannot accept already accepted offer (409)", async () => {
    const offerId = await createOffer();

    await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);

    const res = await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(409);
  });

  // ─── Inventory linkage (P0-4) ───────────────────────────────────

  it("accept fails with 409 when creator has insufficient quantity", async () => {
    const res = await request(app)
      .post("/trade/offers")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        receiverUserId: RECEIVER,
        creatorItemsJson: {
          schemaVersion: 1,
          items: [{ cardId: "card-x", language: "FR", condition: "NM", quantity: 2 }],
        },
        receiverItemsJson: { schemaVersion: 1, items: [] },
      });
    expect(res.status).toBe(201);
    const offerId = res.body.data.tradeOfferId;

    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        cardId: "card-x",
        language: "FR",
        condition: "NM",
        quantity: 1,
      });

    const acceptRes = await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(acceptRes.status).toBe(409);
    expect(acceptRes.body.error?.code).toBe("INSUFFICIENT_QUANTITY");
  });

  it("accept updates both collections when items are present", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        cardId: "creator-card",
        language: "FR",
        condition: "NM",
        quantity: 2,
      });
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        cardId: "receiver-card",
        language: "EN",
        condition: "LP",
        quantity: 1,
      });

    const res = await request(app)
      .post("/trade/offers")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        receiverUserId: RECEIVER,
        creatorItemsJson: {
          schemaVersion: 1,
          items: [{ cardId: "creator-card", language: "FR", condition: "NM", quantity: 1 }],
        },
        receiverItemsJson: {
          schemaVersion: 1,
          items: [{ cardId: "receiver-card", language: "EN", condition: "LP", quantity: 1 }],
        },
      });
    expect(res.status).toBe(201);
    const offerId = res.body.data.tradeOfferId;

    const acceptRes = await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(acceptRes.status).toBe(200);

    const creatorCollection = await prisma.userCollection.findMany({
      where: { userId: CREATOR },
    });
    const receiverCollection = await prisma.userCollection.findMany({
      where: { userId: RECEIVER },
    });
    expect(creatorCollection.find((c) => c.cardId === "creator-card")?.quantity).toBe(1);
    expect(creatorCollection.find((c) => c.cardId === "receiver-card")?.quantity).toBe(1);
    expect(receiverCollection.find((c) => c.cardId === "creator-card")?.quantity).toBe(1);
    expect(receiverCollection.find((c) => c.cardId === "receiver-card")).toBeUndefined();
  });

  // ─── Counter-offer ──────────────────────────────────────────

  it("receiver can counter: creates new offer linked to original", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .post(`/trade/offers/${offerId}/counter`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
        expiresInHours: 48,
      });
    expect(res.status).toBe(201);
    const counterId = res.body.data.tradeOfferId;
    expect(counterId).toBeDefined();

    const counter = await prisma.tradeOffer.findUnique({
      where: { id: counterId },
    });
    expect(counter).not.toBeNull();
    expect(counter!.counterOfOfferId).toBe(offerId);
    expect(counter!.creatorUserId).toBe(RECEIVER);
    expect(counter!.receiverUserId).toBe(CREATOR);
    expect(counter!.status).toBe("PENDING");

    const event = await prisma.tradeEvent.findFirst({
      where: { tradeOfferId: offerId, type: "COUNTERED" },
    });
    expect(event).not.toBeNull();
    expect(event!.actorUserId).toBe(RECEIVER);
  });

  it("counter returns 403 if not receiver", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .post(`/trade/offers/${offerId}/counter`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
      });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("accept original returns 409 OFFER_COUNTERED when counter exists", async () => {
    const offerId = await createOffer();

    await request(app)
      .post(`/trade/offers/${offerId}/counter`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
      });

    const res = await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("OFFER_COUNTERED");
  });

  it("counter returns 409 if original not PENDING (e.g. accepted)", async () => {
    const offerId = await createOffer();
    await request(app)
      .post(`/trade/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${receiverToken}`);

    const res = await request(app)
      .post(`/trade/offers/${offerId}/counter`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
      });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("INVALID_STATE");
  });

  it("pagination sent/received includes counter-offers", async () => {
    const offerId = await createOffer();
    const counterRes = await request(app)
      .post(`/trade/offers/${offerId}/counter`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
      });
    expect(counterRes.status).toBe(201);
    const counterId = counterRes.body.data.tradeOfferId;

    const sentByReceiver = await request(app)
      .get("/trade/offers?type=sent&limit=10")
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(sentByReceiver.status).toBe(200);
    const ids = sentByReceiver.body.data.items.map((o: { id: string }) => o.id);
    expect(ids).toContain(counterId);

    const receivedByCreator = await request(app)
      .get("/trade/offers?type=received&limit=10")
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(receivedByCreator.status).toBe(200);
    const receivedIds = receivedByCreator.body.data.items.map((o: { id: string }) => o.id);
    expect(receivedIds).toContain(counterId);
  });
});
