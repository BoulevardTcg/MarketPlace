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

describe("Pricing", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── GET /cards/:cardId/price ─────────────────────────────────

  it("GET /cards/:cardId/price returns 404 when no ExternalProductRef", async () => {
    const res = await request(app)
      .get("/cards/card-unknown/price")
      .query({ language: "FR" });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });

  it("GET /cards/:cardId/price returns 404 when ref exists but no snapshot", async () => {
    await prisma.externalProductRef.create({
      data: {
        source: PriceSource.CARDMARKET,
        game: "POKEMON",
        cardId: "card-1",
        language: "FR",
        externalProductId: "ext-1",
      },
    });
    const res = await request(app)
      .get("/cards/card-1/price")
      .query({ language: "FR" });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });

  it("GET /cards/:cardId/price returns 200 with latest snapshot when data exists", async () => {
    await prisma.externalProductRef.create({
      data: {
        source: PriceSource.CARDMARKET,
        game: "POKEMON",
        cardId: "card-1",
        language: "FR",
        externalProductId: "ext-1",
      },
    });
    await prisma.cardPriceSnapshot.create({
      data: {
        source: PriceSource.CARDMARKET,
        externalProductId: "ext-1",
        currency: "EUR",
        trendCents: 150,
        avgCents: 160,
        lowCents: 140,
      },
    });
    const res = await request(app)
      .get("/cards/card-1/price")
      .query({ language: "FR" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      cardId: "card-1",
      language: "FR",
      source: "CARDMARKET",
      externalProductId: "ext-1",
      currency: "EUR",
      trendCents: 150,
      avgCents: 160,
      lowCents: 140,
    });
    expect(res.body.data.capturedAt).toBeDefined();
  });

  // ─── GET /users/me/portfolio ───────────────────────────────────

  it("GET /users/me/portfolio returns 401 without auth", async () => {
    const res = await request(app).get("/users/me/portfolio");
    expect(res.status).toBe(401);
  });

  it("GET /users/me/portfolio returns 200 with zeroed values when collection empty", async () => {
    const token = makeToken("user-1");
    const res = await request(app)
      .get("/users/me/portfolio")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalValueCents: 0,
      totalCostCents: 0,
      pnlCents: 0,
      currency: "EUR",
      itemCount: 0,
      valuedCount: 0,
      missingCount: 0,
    });
  });

  it("GET /users/me/portfolio computes correct totals with collection + refs + snapshots", async () => {
    const userId = "user-1";
    const token = makeToken(userId);

    await prisma.userCollection.create({
      data: {
        userId,
        cardId: "card-1",
        language: "FR",
        condition: "NM",
        quantity: 2,
        acquisitionPriceCents: 100,
      },
    });
    await prisma.externalProductRef.create({
      data: {
        source: PriceSource.CARDMARKET,
        game: "POKEMON",
        cardId: "card-1",
        language: "FR",
        externalProductId: "ext-1",
      },
    });
    await prisma.cardPriceSnapshot.create({
      data: {
        source: PriceSource.CARDMARKET,
        externalProductId: "ext-1",
        trendCents: 150,
        avgCents: 160,
        lowCents: 140,
      },
    });

    const res = await request(app)
      .get("/users/me/portfolio")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalValueCents).toBe(2 * 150); // 300
    expect(res.body.data.totalCostCents).toBe(2 * 100); // 200
    expect(res.body.data.pnlCents).toBe(300 - 200); // 100
    expect(res.body.data.itemCount).toBe(1);
    expect(res.body.data.valuedCount).toBe(1);
    expect(res.body.data.missingCount).toBe(0);
  });

  it("GET /users/me/portfolio returns missingCount for items without price mapping", async () => {
    const userId = "user-1";
    const token = makeToken(userId);

    await prisma.userCollection.create({
      data: {
        userId,
        cardId: "card-no-ref",
        language: "FR",
        condition: "NM",
        quantity: 1,
      },
    });

    const res = await request(app)
      .get("/users/me/portfolio")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.itemCount).toBe(1);
    expect(res.body.data.valuedCount).toBe(0);
    expect(res.body.data.missingCount).toBe(1);
  });

  // ─── GET /users/me/portfolio/history ───────────────────────────

  it("GET /users/me/portfolio/history returns 401 without auth", async () => {
    const res = await request(app).get("/users/me/portfolio/history");
    expect(res.status).toBe(401);
  });

  // ─── GET /cards/:cardId/price/history ──────────────────────────

  it("GET /cards/:cardId/price/history returns 200 with empty series when no data", async () => {
    const res = await request(app)
      .get("/cards/card-1/price/history")
      .query({ language: "FR" });
    expect(res.status).toBe(200);
    expect(res.body.data.series).toEqual([]);
    expect(res.body.data.stats.firstDay).toBe(null);
    expect(res.body.data.stats.lastDay).toBe(null);
  });

  it("GET /cards/:cardId/price/history returns series sorted by day asc", async () => {
    const day1 = new Date("2026-02-10T00:00:00.000Z");
    const day2 = new Date("2026-02-11T00:00:00.000Z");
    const day3 = new Date("2026-02-12T00:00:00.000Z");

    await prisma.dailyPriceSnapshot.createMany({
      data: [
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: day2, trendCents: 200, lowCents: 180, avgCents: 190 },
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: day1, trendCents: 100, lowCents: 90, avgCents: 95 },
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: day3, trendCents: 300, lowCents: 280, avgCents: 290 },
      ],
    });

    const res = await request(app)
      .get("/cards/card-1/price/history")
      .query({ language: "FR", days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(3);
    expect(res.body.data.series[0].day).toBe("2026-02-10");
    expect(res.body.data.series[1].day).toBe("2026-02-11");
    expect(res.body.data.series[2].day).toBe("2026-02-12");
    expect(res.body.data.series[0].trendCents).toBe(100);
    expect(res.body.data.series[2].trendCents).toBe(300);
  });

  it("GET /cards/:cardId/price/history respects days param", async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const recent = new Date(today);
    recent.setUTCDate(recent.getUTCDate() - 5);

    const old = new Date(today);
    old.setUTCDate(old.getUTCDate() - 15);

    await prisma.dailyPriceSnapshot.createMany({
      data: [
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: recent, trendCents: 200 },
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: old, trendCents: 100 },
      ],
    });

    const res = await request(app)
      .get("/cards/card-1/price/history")
      .query({ language: "FR", days: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(1);
    expect(res.body.data.series[0].trendCents).toBe(200);
  });

  it("GET /cards/:cardId/price/history filters by language", async () => {
    const day = new Date("2026-02-10T00:00:00.000Z");

    await prisma.dailyPriceSnapshot.createMany({
      data: [
        { cardId: "card-1", language: "FR", source: "TCGDEX", day, trendCents: 100 },
        { cardId: "card-1", language: "EN", source: "TCGDEX", day, trendCents: 200 },
      ],
    });

    const resFr = await request(app)
      .get("/cards/card-1/price/history")
      .query({ language: "FR" });
    expect(resFr.status).toBe(200);
    expect(resFr.body.data.series).toHaveLength(1);
    expect(resFr.body.data.series[0].trendCents).toBe(100);

    const resEn = await request(app)
      .get("/cards/card-1/price/history")
      .query({ language: "EN" });
    expect(resEn.status).toBe(200);
    expect(resEn.body.data.series).toHaveLength(1);
    expect(resEn.body.data.series[0].trendCents).toBe(200);
  });

  it("GET /cards/:cardId/price/history computes stats correctly", async () => {
    const day1 = new Date("2026-02-10T00:00:00.000Z");
    const day2 = new Date("2026-02-11T00:00:00.000Z");
    const day3 = new Date("2026-02-12T00:00:00.000Z");

    await prisma.dailyPriceSnapshot.createMany({
      data: [
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: day1, trendCents: 100 },
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: day2, trendCents: 300 },
        { cardId: "card-1", language: "FR", source: "TCGDEX", day: day3, trendCents: 200 },
      ],
    });

    const res = await request(app)
      .get("/cards/card-1/price/history")
      .query({ language: "FR", days: 30 });
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toEqual({
      firstDay: "2026-02-10",
      lastDay: "2026-02-12",
      lastTrendCents: 200,
      minTrendCents: 100,
      maxTrendCents: 300,
    });
  });

  it("GET /cards/:cardId/price/history returns 400 without language", async () => {
    const res = await request(app).get("/cards/card-1/price/history");
    expect(res.status).toBe(400);
  });

  // ─── GET /users/me/portfolio/history ───────────────────────────

  it("GET /users/me/portfolio/history returns 200 with paginated snapshots", async () => {
    const userId = "user-1";
    const token = makeToken(userId);

    await prisma.userPortfolioSnapshot.createMany({
      data: [
        { userId, totalValueCents: 1000, totalCostCents: 800, pnlCents: 200 },
        { userId, totalValueCents: 1100, totalCostCents: 800, pnlCents: 300 },
      ],
    });

    const res = await request(app)
      .get("/users/me/portfolio/history")
      .set("Authorization", `Bearer ${token}`)
      .query({ range: "30d", limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.nextCursor).toBe(null);
    expect(res.body.data.items[0].totalValueCents).toBe(1100);
    expect(res.body.data.items[1].totalValueCents).toBe(1000);
  });
});
