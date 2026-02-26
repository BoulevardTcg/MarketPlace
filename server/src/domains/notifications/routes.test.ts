import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../app.js";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) => jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

const USER_A = "user-notif-a";
const USER_B = "user-notif-b";

describe("Notifications", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /notifications without token returns 401", async () => {
    const res = await request(app).get("/notifications");
    expect(res.status).toBe(401);
  });

  it("GET /notifications/unread-count starts at 0", async () => {
    const res = await request(app)
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });

  it("GET /notifications returns empty list initially", async () => {
    const res = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.nextCursor).toBeNull();
  });

  it("creates notification and appears in list", async () => {
    await prisma.notification.create({
      data: {
        userId: USER_A,
        type: "TRADE_OFFER_RECEIVED",
        title: "Test",
        body: "Test body",
        isRead: false,
      },
    });

    const res = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe("Test");
    expect(res.body.data.items[0].isRead).toBe(false);
  });

  it("unread-count reflects unread notifications", async () => {
    await prisma.notification.createMany({
      data: [
        { userId: USER_A, type: "TRADE_OFFER_RECEIVED", title: "A", body: "B", isRead: false },
        { userId: USER_A, type: "TRADE_OFFER_ACCEPTED", title: "C", body: "D", isRead: true },
        { userId: USER_A, type: "LISTING_SOLD", title: "E", body: "F", isRead: false },
      ],
    });

    const res = await request(app)
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });

  it("POST /notifications/read marks selected notifications as read", async () => {
    const notif = await prisma.notification.create({
      data: {
        userId: USER_A,
        type: "TRADE_OFFER_RECEIVED",
        title: "Unread",
        body: "body",
        isRead: false,
      },
    });

    const res = await request(app)
      .post("/notifications/read")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`)
      .send({ ids: [notif.id] });
    expect(res.status).toBe(200);

    const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
    expect(updated?.isRead).toBe(true);

    const countRes = await request(app)
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(countRes.body.data.count).toBe(0);
  });

  it("POST /notifications/read-all marks all as read", async () => {
    await prisma.notification.createMany({
      data: [
        { userId: USER_A, type: "TRADE_OFFER_RECEIVED", title: "A", body: "B", isRead: false },
        { userId: USER_A, type: "TRADE_OFFER_ACCEPTED", title: "C", body: "D", isRead: false },
      ],
    });

    const res = await request(app)
      .post("/notifications/read-all")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(200);

    const count = await prisma.notification.count({ where: { userId: USER_A, isRead: false } });
    expect(count).toBe(0);
  });

  it("POST /notifications/read cannot mark another user's notification", async () => {
    const notif = await prisma.notification.create({
      data: {
        userId: USER_B,
        type: "TRADE_OFFER_RECEIVED",
        title: "B's notif",
        body: "body",
        isRead: false,
      },
    });

    // USER_A tries to read USER_B's notification (should silently do nothing, not error)
    await request(app)
      .post("/notifications/read")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`)
      .send({ ids: [notif.id] });

    // USER_B's notification should still be unread
    const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
    expect(updated?.isRead).toBe(false);
  });

  it("DELETE /notifications/:id deletes own notification", async () => {
    const notif = await prisma.notification.create({
      data: {
        userId: USER_A,
        type: "LISTING_SOLD",
        title: "Sold",
        body: "body",
        isRead: false,
      },
    });

    const res = await request(app)
      .delete(`/notifications/${notif.id}`)
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(200);

    const deleted = await prisma.notification.findUnique({ where: { id: notif.id } });
    expect(deleted).toBeNull();
  });

  it("DELETE /notifications/:id cannot delete another user's notification", async () => {
    const notif = await prisma.notification.create({
      data: {
        userId: USER_B,
        type: "LISTING_SOLD",
        title: "B's",
        body: "body",
        isRead: false,
      },
    });

    const res = await request(app)
      .delete(`/notifications/${notif.id}`)
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(403);
  });

  it("GET /notifications?unread=true returns only unread", async () => {
    await prisma.notification.createMany({
      data: [
        { userId: USER_A, type: "TRADE_OFFER_RECEIVED", title: "Unread", body: "body", isRead: false },
        { userId: USER_A, type: "TRADE_OFFER_ACCEPTED", title: "Read", body: "body", isRead: true },
      ],
    });

    const res = await request(app)
      .get("/notifications?unread=true")
      .set("Authorization", `Bearer ${makeToken(USER_A)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe("Unread");
  });
});
