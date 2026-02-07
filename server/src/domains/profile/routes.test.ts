import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) =>
  jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

describe("Profile", () => {
  const userId = "user-profile-1";
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

  it("GET /users/:id/profile returns 404 when profile does not exist", async () => {
    const res = await request(app).get("/users/some-unknown-id/profile");
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });

  it("GET /users/:id/profile returns profile when it exists (public)", async () => {
    await prisma.userProfile.create({
      data: {
        userId: "public-user",
        username: "alice",
        bio: "Hello",
      },
    });
    const res = await request(app).get("/users/public-user/profile");
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe("public-user");
    expect(res.body.data.username).toBe("alice");
    expect(res.body.data.bio).toBe("Hello");
  });

  it("GET /users/me/profile returns 401 without auth", async () => {
    const res = await request(app).get("/users/me/profile");
    expect(res.status).toBe(401);
  });

  it("GET /users/me/profile creates stub and returns profile when authenticated", async () => {
    const res = await request(app)
      .get("/users/me/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(userId);
    expect(res.body.data.username).toBeDefined();
    const count = await prisma.userProfile.count({ where: { userId } });
    expect(count).toBe(1);
  });

  it("PATCH /users/me/profile returns 401 without auth", async () => {
    const res = await request(app)
      .patch("/users/me/profile")
      .send({ username: "newname" });
    expect(res.status).toBe(401);
  });

  it("PATCH /users/me/profile updates profile when authenticated", async () => {
    await prisma.userProfile.create({
      data: { userId, username: "oldname" },
    });
    const res = await request(app)
      .patch("/users/me/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "newname", bio: "My bio" });
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe("newname");
    expect(res.body.data.bio).toBe("My bio");
  });
});
