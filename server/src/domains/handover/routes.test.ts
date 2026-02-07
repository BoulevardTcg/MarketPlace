import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string, roles?: string[]) =>
  jwt.sign(
    { sub: userId, ...(roles?.length ? { roles } : {}) },
    secret,
    { algorithm: "HS256" },
  );

describe("Handover (remise en main propre)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /handovers rejects when neither listingId nor tradeOfferId (XOR)", async () => {
    const token = makeToken("user-1");
    const res = await request(app)
      .post("/handovers")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("POST /handovers rejects when both listingId and tradeOfferId (XOR)", async () => {
    const token = makeToken("user-1");
    const listing = await prisma.listing.create({
      data: {
        userId: "user-1",
        title: "Card",
        priceCents: 100,
        game: "POKEMON",
        category: "CARD",
        language: "FR",
        condition: "NM",
        status: "PUBLISHED",
      },
    });
    const trade = await prisma.tradeOffer.create({
      data: {
        creatorUserId: "user-1",
        receiverUserId: "other",
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
        status: "PENDING",
      },
    });
    const res = await request(app)
      .post("/handovers")
      .set("Authorization", `Bearer ${token}`)
      .send({ listingId: listing.id, tradeOfferId: trade.id });
    expect(res.status).toBe(400);
  });

  it("POST /handovers with listingId creates handover when user is listing owner", async () => {
    const token = makeToken("owner-1");
    const listing = await prisma.listing.create({
      data: {
        userId: "owner-1",
        title: "My card",
        priceCents: 500,
        game: "POKEMON",
        category: "CARD",
        language: "FR",
        condition: "NM",
        status: "PUBLISHED",
      },
    });
    const res = await request(app)
      .post("/handovers")
      .set("Authorization", `Bearer ${token}`)
      .send({ listingId: listing.id });
    expect(res.status).toBe(201);
    expect(res.body.data.handoverId).toBeDefined();
    expect(res.body.data.handover.status).toBe("PENDING_VERIFICATION");
    expect(res.body.data.handover.listingId).toBe(listing.id);
    expect(res.body.data.handover.requestedByUserId).toBe("owner-1");
  });

  it("POST /handovers with listingId returns 403 when user is not listing owner", async () => {
    const token = makeToken("other-user");
    const listing = await prisma.listing.create({
      data: {
        userId: "owner-1",
        title: "My card",
        priceCents: 500,
        game: "POKEMON",
        category: "CARD",
        language: "FR",
        condition: "NM",
        status: "PUBLISHED",
      },
    });
    const res = await request(app)
      .post("/handovers")
      .set("Authorization", `Bearer ${token}`)
      .send({ listingId: listing.id });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("POST /handovers with listingId returns 409 when pending handover already exists for listing", async () => {
    const token = makeToken("owner-1");
    const listing = await prisma.listing.create({
      data: {
        userId: "owner-1",
        title: "My card",
        priceCents: 500,
        game: "POKEMON",
        category: "CARD",
        language: "FR",
        condition: "NM",
        status: "PUBLISHED",
      },
    });
    await prisma.handover.create({
      data: { listingId: listing.id, requestedByUserId: "owner-1", status: "PENDING_VERIFICATION" },
    });
    const res = await request(app)
      .post("/handovers")
      .set("Authorization", `Bearer ${token}`)
      .send({ listingId: listing.id });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("CONFLICT");
  });

  it("POST /handovers with tradeOfferId creates handover when user is creator or receiver", async () => {
    const token = makeToken("creator-1");
    const trade = await prisma.tradeOffer.create({
      data: {
        creatorUserId: "creator-1",
        receiverUserId: "receiver-1",
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
        status: "ACCEPTED",
      },
    });
    const res = await request(app)
      .post("/handovers")
      .set("Authorization", `Bearer ${token}`)
      .send({ tradeOfferId: trade.id });
    expect(res.status).toBe(201);
    expect(res.body.data.handover.tradeOfferId).toBe(trade.id);
    expect(res.body.data.handover.requestedByUserId).toBe("creator-1");
  });

  it("POST /handovers with tradeOfferId returns 403 when user is not party", async () => {
    const token = makeToken("third-party");
    const trade = await prisma.tradeOffer.create({
      data: {
        creatorUserId: "creator-1",
        receiverUserId: "receiver-1",
        creatorItemsJson: { schemaVersion: 1, items: [] },
        receiverItemsJson: { schemaVersion: 1, items: [] },
        status: "PENDING",
      },
    });
    const res = await request(app)
      .post("/handovers")
      .set("Authorization", `Bearer ${token}`)
      .send({ tradeOfferId: trade.id });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("GET /handovers returns only own handovers when mine=1 (default)", async () => {
    const token = makeToken("user-a");
    await prisma.handover.create({
      data: {
        requestedByUserId: "user-a",
        status: "PENDING_VERIFICATION",
      },
    });
    await prisma.handover.create({
      data: {
        requestedByUserId: "user-b",
        status: "PENDING_VERIFICATION",
      },
    });
    const res = await request(app)
      .get("/handovers")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].requestedByUserId).toBe("user-a");
  });

  it("PATCH /handovers/:id returns 403 when user has no ADMIN role", async () => {
    const token = makeToken("user-1");
    const handover = await prisma.handover.create({
      data: {
        requestedByUserId: "user-1",
        status: "PENDING_VERIFICATION",
      },
    });
    const res = await request(app)
      .patch(`/handovers/${handover.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "VERIFIED" });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("PATCH /handovers/:id updates status when user has ADMIN role", async () => {
    const adminToken = makeToken("admin-1", ["ADMIN"]);
    const handover = await prisma.handover.create({
      data: {
        requestedByUserId: "user-1",
        status: "PENDING_VERIFICATION",
      },
    });
    const res = await request(app)
      .patch(`/handovers/${handover.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "VERIFIED" });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("VERIFIED");
    expect(res.body.data.verifiedByUserId).toBe("admin-1");
  });

  it("PATCH /handovers/:id returns 404 when handover does not exist", async () => {
    const adminToken = makeToken("admin-1", ["ADMIN"]);
    const res = await request(app)
      .patch("/handovers/nonexistent-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "VERIFIED" });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });

  it("PATCH /handovers/:id returns 409 when already verified or rejected (atomic)", async () => {
    const adminToken = makeToken("admin-1", ["ADMIN"]);
    const handover = await prisma.handover.create({
      data: {
        requestedByUserId: "user-1",
        status: "VERIFIED",
      },
    });
    const res = await request(app)
      .patch(`/handovers/${handover.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "REJECTED" });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("CONFLICT");
  });
});
