import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) =>
  jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

describe("Marketplace", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── Auth ─────────────────────────────────────────────────────

  it("POST /marketplace/listings without token returns 401", async () => {
    const res = await request(app)
      .post("/marketplace/listings")
      .set("Content-Type", "application/json")
      .send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });

  it("POST /marketplace/listings with valid token returns 201", async () => {
    const token = makeToken("test-user-id");
    const res = await request(app)
      .post("/marketplace/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Test listing",
        priceCents: 500,
        quantity: 1,
        game: "POKEMON",
        category: "CARD",
        language: "FR",
        condition: "NM",
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("listingId");
    expect(typeof res.body.data.listingId).toBe("string");

    const event = await prisma.listingEvent.findFirst({
      where: { listingId: res.body.data.listingId, type: "CREATED" },
    });
    expect(event).not.toBeNull();
  });

  // ─── Browse ───────────────────────────────────────────────────

  describe("GET /marketplace/listings", () => {
    let publishedIds: string[];

    beforeEach(async () => {
      publishedIds = [];
      const token1 = makeToken("seller-1");
      const token2 = makeToken("seller-2");

      // Create + publish listing 1 (Pokemon, 5000 cents)
      let res = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token1}`)
        .send({
          title: "Pokemon Charizard",
          priceCents: 5000,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id1 = res.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id1}/publish`)
        .set("Authorization", `Bearer ${token1}`);
      publishedIds.push(id1);

      // Small delay so publishedAt differs
      await new Promise((r) => setTimeout(r, 50));

      // Create + publish listing 2 (MTG, 100000 cents)
      res = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token2}`)
        .send({
          title: "MTG Black Lotus",
          priceCents: 100000,
          game: "MTG",
          category: "CARD",
          language: "EN",
          condition: "LP",
        });
      const id2 = res.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id2}/publish`)
        .set("Authorization", `Bearer ${token2}`);
      publishedIds.push(id2);

      // Create a DRAFT (should NOT appear in browse)
      await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token1}`)
        .send({
          title: "Draft card",
          priceCents: 100,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
    });

    it("returns only PUBLISHED listings", async () => {
      const res = await request(app).get("/marketplace/listings");
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(
        res.body.data.items.every(
          (i: { status: string }) => i.status === "PUBLISHED",
        ),
      ).toBe(true);
    });

    it("filters by game", async () => {
      const res = await request(app).get(
        "/marketplace/listings?game=POKEMON",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].game).toBe("POKEMON");
    });

    it("filters by price range", async () => {
      const res = await request(app).get(
        "/marketplace/listings?minPrice=4000&maxPrice=6000",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].priceCents).toBe(5000);
    });

    it("paginates with cursor, no duplicates", async () => {
      const res1 = await request(app).get("/marketplace/listings?limit=1");
      expect(res1.status).toBe(200);
      expect(res1.body.data.items).toHaveLength(1);
      expect(res1.body.data.nextCursor).toBeTruthy();

      const res2 = await request(app).get(
        `/marketplace/listings?limit=1&cursor=${res1.body.data.nextCursor}`,
      );
      expect(res2.status).toBe(200);
      expect(res2.body.data.items).toHaveLength(1);
      expect(res2.body.data.nextCursor).toBeNull();

      // No duplicates
      expect(res1.body.data.items[0].id).not.toBe(res2.body.data.items[0].id);
    });

    it("sorts by price_asc", async () => {
      const res = await request(app).get(
        "/marketplace/listings?sort=price_asc",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.items[0].priceCents).toBe(5000);
      expect(res.body.data.items[1].priceCents).toBe(100000);
    });

    it("search filters by title", async () => {
      const res = await request(app).get(
        "/marketplace/listings?search=Charizard",
      );
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toBe("Pokemon Charizard");
    });

    it("cursor from one sort rejects when used with different sort (400)", async () => {
      // Get cursor from date_desc (default)
      const res1 = await request(app).get("/marketplace/listings?limit=1");
      expect(res1.status).toBe(200);
      expect(res1.body.data.nextCursor).toBeTruthy();

      // Use that cursor with price_asc → should fail
      const res2 = await request(app).get(
        `/marketplace/listings?limit=1&sort=price_asc&cursor=${res1.body.data.nextCursor}`,
      );
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe("INVALID_CURSOR");
    });
  });

  // ─── Detail ───────────────────────────────────────────────────

  describe("GET /marketplace/listings/:id", () => {
    it("returns PUBLISHED listing without auth", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app).get(`/marketplace/listings/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    it("returns DRAFT to owner, 404 to others", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;

      // No auth → 404
      const res1 = await request(app).get(`/marketplace/listings/${id}`);
      expect(res1.status).toBe(404);

      // Owner → 200
      const res2 = await request(app)
        .get(`/marketplace/listings/${id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res2.status).toBe(200);

      // Other user → 404
      const otherToken = makeToken("other-user");
      const res3 = await request(app)
        .get(`/marketplace/listings/${id}`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res3.status).toBe(404);
    });
  });

  // ─── Lifecycle ────────────────────────────────────────────────

  describe("Listing lifecycle", () => {
    it("PATCH only works on DRAFT", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;

      // PATCH DRAFT → OK
      const patchRes = await request(app)
        .patch(`/marketplace/listings/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Updated title" });
      expect(patchRes.status).toBe(200);

      // Verify title changed
      const listing = await prisma.listing.findUnique({ where: { id } });
      expect(listing!.title).toBe("Updated title");

      // Publish
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);

      // PATCH PUBLISHED → 409
      const patchRes2 = await request(app)
        .patch(`/marketplace/listings/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Should fail" });
      expect(patchRes2.status).toBe(409);
    });

    it("archive from DRAFT", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;

      const res = await request(app)
        .post(`/marketplace/listings/${id}/archive`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);

      const listing = await prisma.listing.findUnique({ where: { id } });
      expect(listing!.status).toBe("ARCHIVED");
    });

    it("archive from PUBLISHED", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .post(`/marketplace/listings/${id}/archive`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);

      const listing = await prisma.listing.findUnique({ where: { id } });
      expect(listing!.status).toBe("ARCHIVED");
    });

    it("archive from SOLD returns 409", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);
      await request(app)
        .post(`/marketplace/listings/${id}/mark-sold`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .post(`/marketplace/listings/${id}/archive`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(409);
    });

    it("mark-sold from PUBLISHED", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .post(`/marketplace/listings/${id}/mark-sold`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);

      const listing = await prisma.listing.findUnique({ where: { id } });
      expect(listing!.status).toBe("SOLD");
      expect(listing!.soldAt).not.toBeNull();
    });

    it("mark-sold from DRAFT returns 409", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;

      const res = await request(app)
        .post(`/marketplace/listings/${id}/mark-sold`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(409);
    });

    it("other user cannot publish (403)", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "My card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = createRes.body.data.listingId;

      const otherToken = makeToken("other-user");
      const res = await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── My Listings ──────────────────────────────────────────────

  describe("GET /marketplace/me/listings", () => {
    it("returns only own listings", async () => {
      const token1 = makeToken("user-1");
      const token2 = makeToken("user-2");

      await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token1}`)
        .send({
          title: "User1 card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token2}`)
        .send({
          title: "User2 card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });

      const res = await request(app)
        .get("/marketplace/me/listings")
        .set("Authorization", `Bearer ${token1}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toBe("User1 card");
    });

    it("filters by status", async () => {
      const token = makeToken("user-1");

      const res1 = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Draft",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = res1.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);

      await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Still draft",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });

      const res = await request(app)
        .get("/marketplace/me/listings?status=DRAFT")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe("DRAFT");
    });
  });
});
