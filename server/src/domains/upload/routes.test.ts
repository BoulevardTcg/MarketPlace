import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) =>
  jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

describe("Upload (suggest-from-image)", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /upload returns 401 without auth", async () => {
    const res = await request(app)
      .post("/upload")
      .send({ imageUrl: "https://example.com/card.jpg" });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("POST /upload returns 400 when neither imageUrl nor imageDataUrl", async () => {
    const token = makeToken("user-1");
    const res = await request(app)
      .post("/upload")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("POST /upload returns suggested stub when imageUrl provided", async () => {
    const token = makeToken("user-1");
    const res = await request(app)
      .post("/upload")
      .set("Authorization", `Bearer ${token}`)
      .send({ imageUrl: "https://example.com/card.jpg" });
    expect(res.status).toBe(200);
    expect(res.body.data.suggested).toBeDefined();
    expect(res.body.data.suggested).toMatchObject({
      cardId: null,
      cardName: null,
      setCode: null,
      condition: null,
      language: null,
      edition: null,
    });
  });

  it("POST /upload returns suggested stub when imageDataUrl provided", async () => {
    const token = makeToken("user-1");
    const res = await request(app)
      .post("/upload")
      .set("Authorization", `Bearer ${token}`)
      .send({ imageDataUrl: "data:image/jpeg;base64,/9j/4AAQ" });
    expect(res.status).toBe(200);
    expect(res.body.data.suggested).toBeDefined();
  });
});
