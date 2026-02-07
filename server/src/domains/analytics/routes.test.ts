import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";
import { ListingStatus } from "@prisma/client";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) =>
  jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

describe("Analytics asked-price", () => {
  const userId = "analytics-user";
  let token: string;

  beforeAll(async () => {
    await prisma.$connect();
    token = makeToken(userId);
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /analytics/cards/:cardId/asked-price returns series and stats with language and range", async () => {
    const res = await request(app).get(
      "/analytics/cards/card-xyz/asked-price?language=FR&range=30d"
    );
    expect(res.status).toBe(200);
    expect(res.body.data.cardId).toBe("card-xyz");
    expect(res.body.data.language).toBe("FR");
    expect(res.body.data.range).toBe("30d");
    expect(Array.isArray(res.body.data.series)).toBe(true);
    expect(res.body.data.series.length).toBe(30);
    expect(res.body.data.stats).toBeDefined();
    expect(res.body.data.stats).toHaveProperty("minPriceCents");
    expect(res.body.data.stats).toHaveProperty("medianPriceCents");
    expect(res.body.data.stats).toHaveProperty("maxPriceCents");
    expect(res.body.data.stats).toHaveProperty("totalVolume");
  });

  it("GET /analytics/cards/:cardId/asked-price creates lazy snapshot for today when PUBLISHED listings exist", async () => {
    await request(app)
      .post("/marketplace/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Card X",
        priceCents: 1000,
        quantity: 1,
        game: "POKEMON",
        category: "CARD",
        language: "FR",
        condition: "NM",
        cardId: "lazy-card",
      });
    const listing = await prisma.listing.findFirst({
      where: { userId, cardId: "lazy-card" },
    });
    await prisma.listing.updateMany({
      where: { id: listing!.id },
      data: { status: ListingStatus.PUBLISHED, publishedAt: new Date() },
    });

    const res = await request(app).get(
      "/analytics/cards/lazy-card/asked-price?language=FR&range=7d"
    );
    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalVolume).toBe(1);
    expect(res.body.data.stats.medianPriceCents).toBe(1000);

    const snapshotCount = await prisma.priceSnapshot.count({
      where: { cardId: "lazy-card", language: "FR" },
    });
    expect(snapshotCount).toBe(1);
  });

  it("GET /analytics/cards/:cardId/asked-price separates by language", async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.priceSnapshot.create({
      data: {
        cardId: "multi-lang",
        language: "FR",
        day: today,
        medianPriceCents: 500,
        minPriceCents: 400,
        maxPriceCents: 600,
        volume: 2,
      },
    });
    await prisma.priceSnapshot.create({
      data: {
        cardId: "multi-lang",
        language: "EN",
        day: today,
        medianPriceCents: 800,
        minPriceCents: 700,
        maxPriceCents: 900,
        volume: 1,
      },
    });

    const resFr = await request(app).get(
      "/analytics/cards/multi-lang/asked-price?language=FR&range=7d"
    );
    const resEn = await request(app).get(
      "/analytics/cards/multi-lang/asked-price?language=EN&range=7d"
    );
    expect(resFr.status).toBe(200);
    expect(resEn.status).toBe(200);
    expect(resFr.body.data.language).toBe("FR");
    expect(resEn.body.data.language).toBe("EN");
    expect(resFr.body.data.stats.medianPriceCents).toBe(500);
    expect(resEn.body.data.stats.medianPriceCents).toBe(800);
  });

  it("GET /analytics/cards/:cardId/asked-price requires language query", async () => {
    const res = await request(app).get(
      "/analytics/cards/card-1/asked-price?range=30d"
    );
    expect(res.status).toBe(400);
  });
});

describe("Price Alerts (stop-loss)", () => {
  const userId = "alerts-user";
  let token: string;

  beforeAll(async () => {
    await prisma.$connect();
    token = makeToken(userId);
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /alerts creates alert (auth)", async () => {
    const res = await request(app)
      .post("/alerts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-a",
        language: "FR",
        thresholdCents: 500,
        direction: "DROP",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.cardId).toBe("card-a");
    expect(res.body.data.thresholdCents).toBe(500);
    expect(res.body.data.direction).toBe("DROP");
    expect(res.body.data.active).toBe(true);
  });

  it("GET /alerts returns only own alerts", async () => {
    await prisma.priceAlert.create({
      data: {
        userId,
        cardId: "c1",
        language: "FR",
        thresholdCents: 100,
        direction: "RISE",
      },
    });
    const otherToken = makeToken("other-user");
    await prisma.priceAlert.create({
      data: {
        userId: "other-user",
        cardId: "c2",
        language: "EN",
        thresholdCents: 200,
        direction: "DROP",
      },
    });
    const res = await request(app)
      .get("/alerts?limit=50")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].cardId).toBe("c1");
  });

  it("PATCH /alerts/:id updates own alert", async () => {
    const alert = await prisma.priceAlert.create({
      data: {
        userId,
        cardId: "c1",
        language: "FR",
        thresholdCents: 100,
        direction: "DROP",
      },
    });
    const res = await request(app)
      .patch(`/alerts/${alert.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
  });

  it("DELETE /alerts/:id returns 403 for other user alert", async () => {
    const alert = await prisma.priceAlert.create({
      data: {
        userId: "other-user",
        cardId: "c1",
        language: "FR",
        thresholdCents: 100,
        direction: "DROP",
      },
    });
    const res = await request(app)
      .delete(`/alerts/${alert.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
