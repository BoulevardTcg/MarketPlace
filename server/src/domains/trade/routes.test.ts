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
});
