import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";
import { PriceSource } from "@prisma/client";

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

  // ─── Market price enrichment ───────────────────────────────────

  describe("Market price enrichment", () => {
    it("GET /marketplace/listings includes marketPriceCents and deltaCents when snapshot exists", async () => {
      const token = makeToken("seller-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Card with price",
          priceCents: 1200,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
          cardId: "card-priced",
        });
      const listingId = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${listingId}/publish`)
        .set("Authorization", `Bearer ${token}`);

      await prisma.externalProductRef.create({
        data: {
          source: PriceSource.CARDMARKET,
          game: "POKEMON",
          cardId: "card-priced",
          language: "FR",
          externalProductId: "ext-priced",
        },
      });
      await prisma.cardPriceSnapshot.create({
        data: {
          source: PriceSource.CARDMARKET,
          externalProductId: "ext-priced",
          trendCents: 1000,
          avgCents: 1050,
          lowCents: 950,
        },
      });

      const browse = await request(app).get("/marketplace/listings");
      expect(browse.status).toBe(200);
      const item = browse.body.data.items.find(
        (i: { id: string }) => i.id === listingId,
      );
      expect(item).toBeDefined();
      expect(item.marketPriceCents).toBe(1000);
      expect(item.deltaCents).toBe(1200 - 1000); // 200
    });

    it("GET /marketplace/listings/:id includes marketPriceCents when snapshot exists", async () => {
      const token = makeToken("owner-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Single card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "EN",
          condition: "NM",
          cardId: "card-single",
        });
      const listingId = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${listingId}/publish`)
        .set("Authorization", `Bearer ${token}`);

      await prisma.externalProductRef.create({
        data: {
          source: PriceSource.CARDMARKET,
          game: "POKEMON",
          cardId: "card-single",
          language: "EN",
          externalProductId: "ext-single",
        },
      });
      await prisma.cardPriceSnapshot.create({
        data: {
          source: PriceSource.CARDMARKET,
          externalProductId: "ext-single",
          trendCents: 450,
        },
      });

      const res = await request(app).get(`/marketplace/listings/${listingId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.marketPriceCents).toBe(450);
      expect(res.body.data.deltaCents).toBe(500 - 450); // 50
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

    it("mark-sold with cardId decrements seller inventory", async () => {
      const token = makeToken("seller-inv");
      await request(app)
        .put("/collection/items")
        .set("Authorization", `Bearer ${token}`)
        .send({
          cardId: "sold-card-1",
          language: "FR",
          condition: "NM",
          quantity: 3,
        });
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Card for sale",
          priceCents: 1000,
          quantity: 2,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
          cardId: "sold-card-1",
        });
      const id = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);

      await request(app)
        .post(`/marketplace/listings/${id}/mark-sold`)
        .set("Authorization", `Bearer ${token}`);

      const row = await prisma.userCollection.findUnique({
        where: {
          userId_cardId_language_condition: {
            userId: "seller-inv",
            cardId: "sold-card-1",
            language: "FR",
            condition: "NM",
          },
        },
      });
      expect(row?.quantity).toBe(1);
    });

    it("mark-sold with cardId returns 409 when seller inventory insufficient", async () => {
      const token = makeToken("seller-low");
      await request(app)
        .put("/collection/items")
        .set("Authorization", `Bearer ${token}`)
        .send({
          cardId: "low-card",
          language: "FR",
          condition: "NM",
          quantity: 1,
        });
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Card",
          priceCents: 500,
          quantity: 2,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
          cardId: "low-card",
        });
      const id = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .post(`/marketplace/listings/${id}/mark-sold`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe("INSUFFICIENT_QUANTITY");
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

  describe("Listing images", () => {
    it("POST presigned-upload returns 503 when S3 not configured", async () => {
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
      const listingId = createRes.body.data.listingId;
      const res = await request(app)
        .post(`/marketplace/listings/${listingId}/images/presigned-upload`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(503);
      expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("POST attach creates image and GET list returns it", async () => {
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
      const listingId = createRes.body.data.listingId;
      const storageKey = `listings/${listingId}/550e8400-e29b-41d4-a716-446655440000.jpg`;
      const attachRes = await request(app)
        .post(`/marketplace/listings/${listingId}/images/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({ storageKey, sortOrder: 0 });
      expect(attachRes.status).toBe(201);
      expect(attachRes.body.data.imageId).toBeDefined();
      expect(attachRes.body.data.image.storageKey).toBe(storageKey);

      const listRes = await request(app)
        .get(`/marketplace/listings/${listingId}/images`)
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items).toHaveLength(1);
      expect(listRes.body.data.items[0].storageKey).toBe(storageKey);
    });

    it("POST attach returns 400 for invalid storageKey format", async () => {
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
      const listingId = createRes.body.data.listingId;
      const res = await request(app)
        .post(`/marketplace/listings/${listingId}/images/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({ storageKey: "invalid/key.jpg" });
      expect(res.status).toBe(400);
    });

    it("POST attach returns 400 when storageKey belongs to another listing", async () => {
      const token = makeToken("owner-1");
      const createA = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Listing A",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const createB = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Listing B",
          priceCents: 600,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const listingAId = createA.body.data.listingId;
      const listingBId = createB.body.data.listingId;
      const storageKeyForB = `listings/${listingBId}/550e8400-e29b-41d4-a716-446655440000.jpg`;
      const res = await request(app)
        .post(`/marketplace/listings/${listingAId}/images/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({ storageKey: storageKeyForB, sortOrder: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe("INVALID_STORAGE_KEY");
    });

    it("POST attach returns 409 when listing has max 8 images", async () => {
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
      const listingId = createRes.body.data.listingId;
      for (let i = 0; i < 8; i++) {
        const storageKey = `listings/${listingId}/${"00000000-0000-4000-8000-00000000000" + i}.jpg`;
        await request(app)
          .post(`/marketplace/listings/${listingId}/images/attach`)
          .set("Authorization", `Bearer ${token}`)
          .send({ storageKey, sortOrder: i });
      }
      const storageKey = `listings/${listingId}/550e8400-e29b-41d4-a716-446655440099.jpg`;
      const res = await request(app)
        .post(`/marketplace/listings/${listingId}/images/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({ storageKey });
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe("CONFLICT");
    });

    it("GET listing images returns 404 for other user draft", async () => {
      const token1 = makeToken("user-1");
      const token2 = makeToken("user-2");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token1}`)
        .send({
          title: "Draft",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const listingId = createRes.body.data.listingId;
      const res = await request(app)
        .get(`/marketplace/listings/${listingId}/images`)
        .set("Authorization", `Bearer ${token2}`);
      expect(res.status).toBe(404);
    });

    it("DELETE image removes it (owner only)", async () => {
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
      const listingId = createRes.body.data.listingId;
      const storageKey = `listings/${listingId}/550e8400-e29b-41d4-a716-446655440001.jpg`;
      const attachRes = await request(app)
        .post(`/marketplace/listings/${listingId}/images/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({ storageKey });
      const imageId = attachRes.body.data.imageId;

      const delRes = await request(app)
        .delete(`/marketplace/listings/${listingId}/images/${imageId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(delRes.status).toBe(200);

      const listRes = await request(app)
        .get(`/marketplace/listings/${listingId}/images`)
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.body.data.items).toHaveLength(0);
    });

    it("PATCH reorder updates sortOrder", async () => {
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
      const listingId = createRes.body.data.listingId;
      const a = await request(app)
        .post(`/marketplace/listings/${listingId}/images/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({ storageKey: `listings/${listingId}/550e8400-e29b-41d4-a716-44665544000a.jpg`, sortOrder: 0 });
      const b = await request(app)
        .post(`/marketplace/listings/${listingId}/images/attach`)
        .set("Authorization", `Bearer ${token}`)
        .send({ storageKey: `listings/${listingId}/550e8400-e29b-41d4-a716-44665544000b.jpg`, sortOrder: 1 });
      const idA = a.body.data.imageId;
      const idB = b.body.data.imageId;

      const reorderRes = await request(app)
        .patch(`/marketplace/listings/${listingId}/images/reorder`)
        .set("Authorization", `Bearer ${token}`)
        .send({ imageIds: [idB, idA] });
      expect(reorderRes.status).toBe(200);
      expect(reorderRes.body.data.items[0].id).toBe(idB);
      expect(reorderRes.body.data.items[1].id).toBe(idA);
    });
  });

  describe("Hidden listings (isHidden)", () => {
    it("hidden PUBLISHED listing does not appear in browse", async () => {
      const token = makeToken("seller-1");
      const res1 = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Visible card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const visibleId = res1.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${visibleId}/publish`)
        .set("Authorization", `Bearer ${token}`);

      const res2 = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Hidden card",
          priceCents: 600,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const hiddenId = res2.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${hiddenId}/publish`)
        .set("Authorization", `Bearer ${token}`);
      await prisma.listing.update({ where: { id: hiddenId }, data: { isHidden: true } });

      const browse = await request(app).get("/marketplace/listings");
      expect(browse.status).toBe(200);
      expect(browse.body.data.items).toHaveLength(1);
      expect(browse.body.data.items[0].id).toBe(visibleId);
    });

    it("GET /marketplace/listings/:id returns 404 for hidden listing (non-owner)", async () => {
      const ownerToken = makeToken("owner-1");
      const res1 = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          title: "Hidden card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = res1.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${ownerToken}`);
      await prisma.listing.update({ where: { id }, data: { isHidden: true } });

      // No auth => 404
      const res2 = await request(app).get(`/marketplace/listings/${id}`);
      expect(res2.status).toBe(404);

      // Other user => 404
      const otherToken = makeToken("other-user");
      const res3 = await request(app)
        .get(`/marketplace/listings/${id}`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res3.status).toBe(404);
    });

    it("GET /marketplace/listings/:id returns 200 for hidden listing (owner)", async () => {
      const ownerToken = makeToken("owner-1");
      const res1 = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          title: "Hidden card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = res1.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${ownerToken}`);
      await prisma.listing.update({ where: { id }, data: { isHidden: true } });

      const res2 = await request(app)
        .get(`/marketplace/listings/${id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res2.status).toBe(200);
      expect(res2.body.data.isHidden).toBe(true);
    });

    it("GET /marketplace/listings/:id/images returns 404 for hidden listing (non-owner)", async () => {
      const ownerToken = makeToken("owner-1");
      const res1 = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          title: "Hidden card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const id = res1.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${id}/publish`)
        .set("Authorization", `Bearer ${ownerToken}`);
      await prisma.listing.update({ where: { id }, data: { isHidden: true } });

      const res2 = await request(app).get(`/marketplace/listings/${id}/images`);
      expect(res2.status).toBe(404);
    });
  });

  describe("Favorites", () => {
    it("POST toggle adds favorite for PUBLISHED listing", async () => {
      const token = makeToken("user-1");
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
      const listingId = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${listingId}/publish`)
        .set("Authorization", `Bearer ${token}`);

      const otherToken = makeToken("other-user");
      const res = await request(app)
        .post(`/marketplace/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(201);
      expect(res.body.data.favorited).toBe(true);
    });

    it("POST toggle removes favorite when already favorited", async () => {
      const token = makeToken("user-1");
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
      const listingId = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${listingId}/publish`)
        .set("Authorization", `Bearer ${token}`);

      await request(app)
        .post(`/marketplace/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${token}`);
      const res = await request(app)
        .post(`/marketplace/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.favorited).toBe(false);
    });

    it("POST toggle returns 409 for DRAFT listing", async () => {
      const token = makeToken("user-1");
      const createRes = await request(app)
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
      const listingId = createRes.body.data.listingId;
      const res = await request(app)
        .post(`/marketplace/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe("INVALID_STATE");
    });

    it("GET /marketplace/me/favorites returns only own favorites", async () => {
      const token = makeToken("user-1");
      const createRes = await request(app)
        .post("/marketplace/listings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Card",
          priceCents: 500,
          game: "POKEMON",
          category: "CARD",
          language: "FR",
          condition: "NM",
        });
      const listingId = createRes.body.data.listingId;
      await request(app)
        .post(`/marketplace/listings/${listingId}/publish`)
        .set("Authorization", `Bearer ${token}`);
      await request(app)
        .post(`/marketplace/listings/${listingId}/favorite`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .get("/marketplace/me/favorites")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].listing.id).toBe(listingId);
      expect(res.body.data.items[0].favoriteId).toBeDefined();
    });
  });
});
