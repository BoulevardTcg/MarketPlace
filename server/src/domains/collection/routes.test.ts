import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) =>
  jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

describe("Collection", () => {
  const userId = "collector-1";
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

  // ─── Upsert ───────────────────────────────────────────────────

  it("PUT creates new collection item", async () => {
    const res = await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        cardName: "Charizard",
        language: "FR",
        condition: "NM",
        quantity: 3,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.item.cardId).toBe("card-001");
    expect(res.body.data.item.quantity).toBe(3);
    expect(res.body.data.item.cardName).toBe("Charizard");
  });

  it("PUT upserts (updates quantity) on same key", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "NM",
        quantity: 2,
      });

    const res = await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "NM",
        quantity: 5,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.item.quantity).toBe(5);

    // Only one row in DB
    const count = await prisma.userCollection.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it("different condition creates separate item", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "NM",
        quantity: 2,
      });
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "LP",
        quantity: 1,
      });

    const count = await prisma.userCollection.count({ where: { userId } });
    expect(count).toBe(2);
  });

  // ─── List ─────────────────────────────────────────────────────

  it("GET returns user collection", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "NM",
        quantity: 2,
      });
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-002",
        language: "EN",
        condition: "LP",
        quantity: 1,
      });

    const res = await request(app)
      .get("/collection")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
  });

  it("GET filters by cardId", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "NM",
        quantity: 2,
      });
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-002",
        language: "EN",
        condition: "LP",
        quantity: 1,
      });

    const res = await request(app)
      .get("/collection?cardId=card-001")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].cardId).toBe("card-001");
  });

  it("collection is scoped to user", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "NM",
        quantity: 2,
      });

    const otherToken = makeToken("other-user");
    const res = await request(app)
      .get("/collection")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  // ─── Delete ───────────────────────────────────────────────────

  it("DELETE removes collection item", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "card-001",
        language: "FR",
        condition: "NM",
        quantity: 2,
      });

    const res = await request(app)
      .delete("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ cardId: "card-001", language: "FR", condition: "NM" });
    expect(res.status).toBe(200);

    const count = await prisma.userCollection.count({ where: { userId } });
    expect(count).toBe(0);
  });

  it("DELETE missing item returns 404", async () => {
    const res = await request(app)
      .delete("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ cardId: "nonexistent", language: "FR", condition: "NM" });
    expect(res.status).toBe(404);
  });

  // ─── Auth ─────────────────────────────────────────────────────

  it("GET /collection without token returns 401", async () => {
    const res = await request(app).get("/collection");
    expect(res.status).toBe(401);
  });

  // ─── Dashboard ────────────────────────────────────────────────

  it("GET /collection/dashboard returns shape with totalQty and breakdowns", async () => {
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "c1",
        language: "FR",
        condition: "NM",
        quantity: 2,
        game: "POKEMON",
      });
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        cardId: "c2",
        language: "EN",
        condition: "LP",
        quantity: 1,
        game: "POKEMON",
      });

    const res = await request(app)
      .get("/collection/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalQty).toBe(3);
    expect(res.body.data.breakdownByGame).toBeDefined();
    expect(res.body.data.breakdownByLanguage).toBeDefined();
    expect(res.body.data.breakdownByCondition).toBeDefined();
    expect(res.body.data.masterSetProgress).toBeNull();
  });

  it("GET /collection/dashboard without token returns 401", async () => {
    const res = await request(app).get("/collection/dashboard");
    expect(res.status).toBe(401);
  });

  // ─── Public collection (privacy) ────────────────────────────────

  it("GET /users/:id/collection returns only public items", async () => {
    const otherUserId = "other-public-collection";
    const otherToken = makeToken(otherUserId);
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({
        cardId: "public-card",
        language: "FR",
        condition: "NM",
        quantity: 1,
        isPublic: true,
      });
    await request(app)
      .put("/collection/items")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({
        cardId: "private-card",
        language: "EN",
        condition: "NM",
        quantity: 1,
        isPublic: false,
      });

    const res = await request(app).get(
      `/users/${otherUserId}/collection?limit=50`
    );
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].cardId).toBe("public-card");
  });

  it("GET /users/:id/collection returns empty when no public items", async () => {
    const res = await request(app).get(`/users/${userId}/collection`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });
});
