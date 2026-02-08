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

  it("GET /trade/offers/:id returns counters correctly", async () => {
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

    const originalDetail = await request(app)
      .get(`/trade/offers/${offerId}`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(originalDetail.status).toBe(200);
    expect(originalDetail.body.data.counterOf).toBeNull();
    expect(originalDetail.body.data.counters).toHaveLength(1);
    expect(originalDetail.body.data.counters[0].id).toBe(counterId);
    expect(originalDetail.body.data.counters[0].status).toBe("PENDING");

    const counterDetail = await request(app)
      .get(`/trade/offers/${counterId}`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(counterDetail.status).toBe(200);
    expect(counterDetail.body.data.counterOf).not.toBeNull();
    expect(counterDetail.body.data.counterOf.id).toBe(offerId);
    expect(counterDetail.body.data.counters).toHaveLength(0);
  });

  it("GET /trade/offers/:id returns lastMessage and unreadCount", async () => {
    const offerId = await createOffer();
    await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Hello" });

    const res = await request(app)
      .get(`/trade/offers/${offerId}`)
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lastMessage).not.toBeNull();
    expect(res.body.data.lastMessage.body).toBe("Hello");
    expect(res.body.data.unreadCount).toBe(1);
  });

  it("GET /trade/offers/:id returns 403 for non-participant", async () => {
    const offerId = await createOffer();
    const thirdToken = makeToken("third-party");

    const res = await request(app)
      .get(`/trade/offers/${offerId}`)
      .set("Authorization", `Bearer ${thirdToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
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

  // ─── Trade messages ─────────────────────────────────────────

  it("participant can POST message and get 201 with message persisted", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Hello, can we swap the LP for NM?" });
    expect(res.status).toBe(201);
    expect(res.body.data.message).toBeDefined();
    expect(res.body.data.message.body).toBe("Hello, can we swap the LP for NM?");
    expect(res.body.data.message.senderUserId).toBe(CREATOR);
    expect(res.body.data.message.tradeOfferId).toBe(offerId);

    const inDb = await prisma.tradeMessage.findFirst({
      where: { tradeOfferId: offerId },
    });
    expect(inDb).not.toBeNull();
    expect(inDb!.body).toBe("Hello, can we swap the LP for NM?");
    expect(inDb!.senderUserId).toBe(CREATOR);
  });

  it("participant can GET messages list and pagination works", async () => {
    const offerId = await createOffer();
    await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "First" });
    await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({ body: "Second" });

    const res = await request(app)
      .get(`/trade/offers/${offerId}/messages?limit=10`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].body).toBe("First");
    expect(res.body.data.items[1].body).toBe("Second");
    expect(res.body.data.nextCursor).toBeNull();

    const page1 = await request(app)
      .get(`/trade/offers/${offerId}/messages?limit=1`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(1);
    expect(page1.body.data.nextCursor).not.toBeNull();
    const res2 = await request(app)
      .get(`/trade/offers/${offerId}/messages?limit=5&cursor=${page1.body.data.nextCursor}`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.items).toHaveLength(1);
  });

  it("403 if non-participant tries POST or GET messages", async () => {
    const offerId = await createOffer();
    const thirdToken = makeToken("third-party");

    const postRes = await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${thirdToken}`)
      .send({ body: "Hi" });
    expect(postRes.status).toBe(403);
    expect(postRes.body.error?.code).toBe("FORBIDDEN");

    const getRes = await request(app)
      .get(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${thirdToken}`);
    expect(getRes.status).toBe(403);
    expect(getRes.body.error?.code).toBe("FORBIDDEN");
  });

  it("404 if offer not found for messages", async () => {
    const postRes = await request(app)
      .post("/trade/offers/nonexistent-id/messages")
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Hi" });
    expect(postRes.status).toBe(404);

    const getRes = await request(app)
      .get("/trade/offers/nonexistent-id/messages")
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(getRes.status).toBe(404);
  });

  it("409 if offer expired / cancelled / rejected for messages", async () => {
    const offerId = await createOffer();
    await request(app)
      .post(`/trade/offers/${offerId}/reject`)
      .set("Authorization", `Bearer ${receiverToken}`);

    const postRes = await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Hi" });
    expect(postRes.status).toBe(409);
    expect(postRes.body.error?.code).toBe("INVALID_STATE");

    const getRes = await request(app)
      .get(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(getRes.status).toBe(409);
    expect(getRes.body.error?.code).toBe("INVALID_STATE");
  });

  it("409 OFFER_EXPIRED when offer expired for messages", async () => {
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
      .post(`/trade/offers/${offer.id}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Hi" });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("OFFER_EXPIRED");
  });

  // ─── Trade Inbox (unreadCount + lastMessage) ──────────────────

  it("GET offers returns unreadCount 0 and lastMessage null initially", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .get("/trade/offers?type=received&limit=10")
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].unreadCount).toBe(0);
    expect(res.body.data.items[0].lastMessage).toBeNull();
  });

  it("A sends message => B sees unreadCount 1 and lastMessage", async () => {
    const offerId = await createOffer();

    const postRes = await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Hello from creator" });
    expect(postRes.status).toBe(201);

    const res = await request(app)
      .get("/trade/offers?type=received&limit=10")
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(res.status).toBe(200);
    const offer = res.body.data.items.find((o: { id: string }) => o.id === offerId);
    expect(offer).toBeDefined();
    expect(offer.unreadCount).toBe(1);
    expect(offer.lastMessage).not.toBeNull();
    expect(offer.lastMessage.body).toBe("Hello from creator");
    expect(offer.lastMessage.senderUserId).toBe(CREATOR);
  });

  it("B reads messages => unreadCount becomes 0", async () => {
    const offerId = await createOffer();

    await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Hi" });

    const listBefore = await request(app)
      .get("/trade/offers?type=received&limit=10")
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(listBefore.body.data.items.find((o: { id: string }) => o.id === offerId).unreadCount).toBe(1);

    await request(app)
      .get(`/trade/offers/${offerId}/messages?limit=10`)
      .set("Authorization", `Bearer ${receiverToken}`);

    const listAfter = await request(app)
      .get("/trade/offers?type=received&limit=10")
      .set("Authorization", `Bearer ${receiverToken}`);
    expect(listAfter.body.data.items.find((o: { id: string }) => o.id === offerId).unreadCount).toBe(0);
  });

  it("lastMessage matches latest message in thread", async () => {
    const offerId = await createOffer();

    await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "First" });
    await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send({ body: "Second" });
    await request(app)
      .post(`/trade/offers/${offerId}/messages`)
      .set("Authorization", `Bearer ${creatorToken}`)
      .send({ body: "Third" });

    const res = await request(app)
      .get("/trade/offers?type=received&limit=10")
      .set("Authorization", `Bearer ${receiverToken}`);
    const offer = res.body.data.items.find((o: { id: string }) => o.id === offerId);
    expect(offer.lastMessage.body).toBe("Third");
    expect(offer.lastMessage.senderUserId).toBe(CREATOR);
  });

  // ─── POST /trade/offers/:id/read ───────────────────────────────

  it("POST /trade/offers/:id/read returns 200 for participant", async () => {
    const offerId = await createOffer();

    const res = await request(app)
      .post(`/trade/offers/${offerId}/read`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it("POST /trade/offers/:id/read returns 403 for non-participant", async () => {
    const offerId = await createOffer();
    const thirdToken = makeToken("third-party");

    const res = await request(app)
      .post(`/trade/offers/${offerId}/read`)
      .set("Authorization", `Bearer ${thirdToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("POST /trade/offers/:id/read returns 404 if not found", async () => {
    const res = await request(app)
      .post("/trade/offers/nonexistent-id/read")
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(404);
  });

  it("POST /trade/offers/:id/read returns 409 for invalid state (rejected)", async () => {
    const offerId = await createOffer();
    await request(app)
      .post(`/trade/offers/${offerId}/reject`)
      .set("Authorization", `Bearer ${receiverToken}`);

    const res = await request(app)
      .post(`/trade/offers/${offerId}/read`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("INVALID_STATE");
  });

  it("POST /trade/offers/:id/read returns 409 when offer expired", async () => {
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
      .post(`/trade/offers/${offer.id}/read`)
      .set("Authorization", `Bearer ${creatorToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("OFFER_EXPIRED");
  });
});
