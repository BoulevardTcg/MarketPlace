import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../app.js";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) => jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

const BUYER = "user-buyer-review";
const SELLER = "user-seller-review";
const OTHER = "user-other-review";

async function makePublishedListing(sellerId: string) {
  return prisma.listing.create({
    data: {
      userId: sellerId,
      title: "Review Test Card",
      priceCents: 1000,
      category: "CARD",
      game: "POKEMON",
      language: "FR",
      condition: "NM",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

async function makeCompletedOrder(buyerId: string, listingId: string, priceCents: number) {
  return prisma.purchaseOrder.create({
    data: {
      buyerUserId: buyerId,
      listingId,
      priceCents,
      currency: "EUR",
      status: "COMPLETED",
      webhookEventId: `evt-${Math.random()}`,
    },
  });
}

describe("Reviews", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /reviews without token returns 401", async () => {
    const res = await request(app).post("/reviews").send({});
    expect(res.status).toBe(401);
  });

  it("POST /reviews — success after completed purchase", async () => {
    const listing = await makePublishedListing(SELLER);
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "SOLD", soldAt: new Date() } });
    await makeCompletedOrder(BUYER, listing.id, listing.priceCents);

    const res = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(BUYER)}`)
      .send({
        sellerUserId: SELLER,
        rating: 5,
        comment: "Excellent vendeur !",
        listingId: listing.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.reviewId).toBeDefined();
  });

  it("POST /reviews — fails if no completed order", async () => {
    const listing = await makePublishedListing(SELLER);

    const res = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(BUYER)}`)
      .send({
        sellerUserId: SELLER,
        rating: 4,
        listingId: listing.id,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("POST /reviews — cannot review yourself", async () => {
    const listing = await makePublishedListing(SELLER);

    const res = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(SELLER)}`)
      .send({
        sellerUserId: SELLER,
        rating: 5,
        listingId: listing.id,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("POST /reviews — duplicate review returns 409", async () => {
    const listing = await makePublishedListing(SELLER);
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "SOLD", soldAt: new Date() } });
    await makeCompletedOrder(BUYER, listing.id, listing.priceCents);

    // First review
    await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(BUYER)}`)
      .send({ sellerUserId: SELLER, rating: 5, listingId: listing.id });

    // Second review — should fail
    const res = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(BUYER)}`)
      .send({ sellerUserId: SELLER, rating: 3, listingId: listing.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_REVIEWED");
  });

  it("POST /reviews — rating must be 1-5", async () => {
    const listing = await makePublishedListing(SELLER);
    await makeCompletedOrder(BUYER, listing.id, listing.priceCents);

    const res = await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(BUYER)}`)
      .send({ sellerUserId: SELLER, rating: 6, listingId: listing.id });

    expect(res.status).toBe(400);
  });

  it("GET /users/:id/reviews — list reviews publicly", async () => {
    const listing = await makePublishedListing(SELLER);
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "SOLD", soldAt: new Date() } });
    await makeCompletedOrder(BUYER, listing.id, listing.priceCents);

    await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(BUYER)}`)
      .send({ sellerUserId: SELLER, rating: 4, comment: "Bien", listingId: listing.id });

    const res = await request(app).get(`/users/${SELLER}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].rating).toBe(4);
    expect(res.body.data.items[0].comment).toBe("Bien");
  });

  it("GET /users/:id/reviews/summary — returns avg rating and breakdown", async () => {
    const listing = await makePublishedListing(SELLER);
    await prisma.listing.update({ where: { id: listing.id }, data: { status: "SOLD", soldAt: new Date() } });
    await makeCompletedOrder(BUYER, listing.id, listing.priceCents);

    await request(app)
      .post("/reviews")
      .set("Authorization", `Bearer ${makeToken(BUYER)}`)
      .send({ sellerUserId: SELLER, rating: 5, listingId: listing.id });

    const res = await request(app).get(`/users/${SELLER}/reviews/summary`);
    expect(res.status).toBe(200);
    expect(res.body.data.avgRating).toBe(5);
    expect(res.body.data.totalCount).toBe(1);
    expect(res.body.data.breakdown["5"]).toBe(1);
    expect(res.body.data.breakdown["1"]).toBe(0);
  });

  it("GET /users/:id/reviews/summary — no reviews returns null avgRating", async () => {
    const res = await request(app).get(`/users/${OTHER}/reviews/summary`);
    expect(res.status).toBe(200);
    expect(res.body.data.avgRating).toBeNull();
    expect(res.body.data.totalCount).toBe(0);
  });
});
