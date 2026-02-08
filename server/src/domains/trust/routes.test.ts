import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";
import { clearReportRateLimitForTests } from "./routes.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string, roles?: string[]) =>
  jwt.sign(
    { sub: userId, ...(roles?.length ? { roles } : {}) },
    secret,
    { algorithm: "HS256" },
  );

const createListing = (userId: string, status = "PUBLISHED" as const) =>
  prisma.listing.create({
    data: {
      userId,
      title: "Test Card",
      priceCents: 1000,
      game: "POKEMON",
      category: "CARD",
      language: "FR",
      condition: "NM",
      status,
    },
  });

describe("Trust / Moderation", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    clearReportRateLimitForTests();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -----------------------------------------------------------------------
  // Reports
  // -----------------------------------------------------------------------

  describe("POST /reports/listings/:id", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app)
        .post("/reports/listings/some-id")
        .send({ reason: "spam" });
      expect(res.status).toBe(401);
    });

    it("returns 404 if listing does not exist", async () => {
      const token = makeToken("user-1");
      const res = await request(app)
        .post("/reports/listings/nonexistent")
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "spam" });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 403 when reporting own listing", async () => {
      const token = makeToken("owner-1");
      const listing = await createListing("owner-1");
      const res = await request(app)
        .post(`/reports/listings/${listing.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "test" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("creates a report (201)", async () => {
      const token = makeToken("reporter-1");
      const listing = await createListing("seller-1");
      const res = await request(app)
        .post(`/reports/listings/${listing.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "Counterfeit card", details: "Looks fake" });
      expect(res.status).toBe(201);
      expect(res.body.data.reportId).toBeDefined();
      expect(res.body.data.report.status).toBe("OPEN");
      expect(res.body.data.report.reason).toBe("Counterfeit card");
      expect(res.body.data.report.listingId).toBe(listing.id);
      expect(res.body.data.report.reporterUserId).toBe("reporter-1");
    });

    it("returns 409 ALREADY_REPORTED on duplicate OPEN report", async () => {
      const token = makeToken("reporter-1");
      const listing = await createListing("seller-1");

      const first = await request(app)
        .post(`/reports/listings/${listing.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "spam" });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post(`/reports/listings/${listing.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "another reason" });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("ALREADY_REPORTED");
    });

    it("concurrent duplicate reports: one succeeds, one gets 409 (DB-level anti-spam)", async () => {
      const token = makeToken("reporter-1");
      const listing = await createListing("seller-1");

      const [r1, r2] = await Promise.all([
        request(app)
          .post(`/reports/listings/${listing.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ reason: "concurrent-1" }),
        request(app)
          .post(`/reports/listings/${listing.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ reason: "concurrent-2" }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it("allows re-report after previous report is RESOLVED", async () => {
      const token = makeToken("reporter-1");
      const listing = await createListing("seller-1");

      await request(app)
        .post(`/reports/listings/${listing.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "spam" });

      // Resolve the report directly in DB
      await prisma.listingReport.updateMany({
        where: { listingId: listing.id, reporterUserId: "reporter-1" },
        data: { status: "RESOLVED" },
      });

      const res = await request(app)
        .post(`/reports/listings/${listing.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "still suspicious" });
      expect(res.status).toBe(201);
    });

    it("returns 429 RATE_LIMITED after 5 reports per hour from same user", async () => {
      const token = makeToken("rate-limit-user");
      const listings = await Promise.all([
        createListing("seller-a"),
        createListing("seller-b"),
        createListing("seller-c"),
        createListing("seller-d"),
        createListing("seller-e"),
        createListing("seller-f"),
      ]);

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post(`/reports/listings/${listings[i]!.id}`)
          .set("Authorization", `Bearer ${token}`)
          .send({ reason: `report ${i}` });
        expect(res.status).toBe(201);
      }

      const sixth = await request(app)
        .post(`/reports/listings/${listings[5]!.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "sixth report" });
      expect(sixth.status).toBe(429);
      expect(sixth.body.error?.code).toBe("RATE_LIMITED");
    });
  });

  describe("GET /reports/me", () => {
    it("returns 401 without auth", async () => {
      const res = await request(app).get("/reports/me");
      expect(res.status).toBe(401);
    });

    it("returns paginated list of own reports", async () => {
      const token = makeToken("reporter-1");
      const listing = await createListing("seller-1");

      // Create 3 reports (resolve first 2 to allow multiple)
      await prisma.listingReport.createMany({
        data: [
          { listingId: listing.id, reporterUserId: "reporter-1", reason: "r1", status: "RESOLVED", updatedAt: new Date() },
          { listingId: listing.id, reporterUserId: "reporter-1", reason: "r2", status: "REJECTED", updatedAt: new Date() },
          { listingId: listing.id, reporterUserId: "reporter-1", reason: "r3", status: "OPEN", updatedAt: new Date() },
        ],
      });

      const res = await request(app)
        .get("/reports/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(3);
    });

    it("does not return other users reports", async () => {
      const token = makeToken("reporter-1");
      const listing = await createListing("seller-1");

      await prisma.listingReport.create({
        data: { listingId: listing.id, reporterUserId: "other-user", reason: "spam", updatedAt: new Date() },
      });

      const res = await request(app)
        .get("/reports/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Admin Reports
  // -----------------------------------------------------------------------

  describe("GET /admin/reports/listings", () => {
    it("returns 403 for non-admin", async () => {
      const token = makeToken("user-1");
      const res = await request(app)
        .get("/admin/reports/listings")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 200 with reports for admin", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const listing = await createListing("seller-1");

      await prisma.listingReport.create({
        data: { listingId: listing.id, reporterUserId: "reporter-1", reason: "spam", updatedAt: new Date() },
      });

      const res = await request(app)
        .get("/admin/reports/listings")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].reason).toBe("spam");
    });

    it("filters by status", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const listing = await createListing("seller-1");

      await prisma.listingReport.createMany({
        data: [
          { listingId: listing.id, reporterUserId: "r1", reason: "a", status: "OPEN", updatedAt: new Date() },
          { listingId: listing.id, reporterUserId: "r2", reason: "b", status: "RESOLVED", updatedAt: new Date() },
        ],
      });

      const res = await request(app)
        .get("/admin/reports/listings?status=OPEN")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].reason).toBe("a");
    });
  });

  // -----------------------------------------------------------------------
  // Admin Patch Report
  // -----------------------------------------------------------------------

  describe("PATCH /admin/reports/:id", () => {
    it("returns 403 for non-admin", async () => {
      const token = makeToken("user-1");
      const res = await request(app)
        .patch("/admin/reports/some-id")
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "RESOLVED" });
      expect(res.status).toBe(403);
    });

    it("resolves an OPEN report", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const listing = await createListing("seller-1");
      const report = await prisma.listingReport.create({
        data: { listingId: listing.id, reporterUserId: "r1", reason: "spam", updatedAt: new Date() },
      });

      const res = await request(app)
        .patch(`/admin/reports/${report.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "RESOLVED" });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("RESOLVED");
    });

    it("returns 404 if report does not exist", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .patch("/admin/reports/nonexistent")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "RESOLVED" });
      expect(res.status).toBe(404);
    });

    it("returns 409 REPORT_NOT_OPEN if report already resolved", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const listing = await createListing("seller-1");
      const report = await prisma.listingReport.create({
        data: { listingId: listing.id, reporterUserId: "r1", reason: "spam", status: "RESOLVED", updatedAt: new Date() },
      });

      const res = await request(app)
        .patch(`/admin/reports/${report.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "REJECTED" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("REPORT_NOT_OPEN");
    });
  });

  describe("GET /admin/reports/listings/:id", () => {
    it("returns 403 for non-admin", async () => {
      const token = makeToken("user-1");
      const res = await request(app)
        .get("/admin/reports/listings/some-id")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("returns 404 if report does not exist", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .get("/admin/reports/listings/nonexistent")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 200 with report detail for admin", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const listing = await createListing("seller-1");
      const report = await prisma.listingReport.create({
        data: { listingId: listing.id, reporterUserId: "r1", reason: "spam", details: "details", updatedAt: new Date() },
      });

      const res = await request(app)
        .get(`/admin/reports/listings/${report.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(report.id);
      expect(res.body.data.listingId).toBe(listing.id);
      expect(res.body.data.reporterUserId).toBe("r1");
      expect(res.body.data.reason).toBe("spam");
      expect(res.body.data.details).toBe("details");
      expect(res.body.data.status).toBe("OPEN");
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Moderation Actions
  // -----------------------------------------------------------------------

  describe("POST /admin/moderation/actions", () => {
    it("returns 403 for non-admin", async () => {
      const token = makeToken("user-1");
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${token}`)
        .send({ targetType: "LISTING", targetId: "x", actionType: "HIDE" });
      expect(res.status).toBe(403);
    });

    it("creates a NOTE action", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "user-1", actionType: "NOTE", note: "Suspicious activity" });
      expect(res.status).toBe(201);
      expect(res.body.data.action.actionType).toBe("NOTE");
      expect(res.body.data.action.actorUserId).toBe("admin-1");
    });

    it("HIDE action sets isHidden=true without changing status", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const listing = await createListing("seller-1", "PUBLISHED");

      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "LISTING", targetId: listing.id, actionType: "HIDE" });
      expect(res.status).toBe(201);

      const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(updated!.isHidden).toBe(true);
      expect(updated!.status).toBe("PUBLISHED"); // status unchanged
    });

    it("UNHIDE action sets isHidden=false without changing status", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const listing = await createListing("seller-1", "PUBLISHED");
      await prisma.listing.update({ where: { id: listing.id }, data: { isHidden: true } });

      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "LISTING", targetId: listing.id, actionType: "UNHIDE" });
      expect(res.status).toBe(201);

      const updated = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(updated!.isHidden).toBe(false);
      expect(updated!.status).toBe("PUBLISHED"); // status unchanged
    });

    it("HIDE returns 404 if listing does not exist", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "LISTING", targetId: "nonexistent", actionType: "HIDE" });
      expect(res.status).toBe(404);
    });

    it("USER HIDE/UNHIDE returns 400 INVALID_ACTION", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "user-1", actionType: "HIDE" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ACTION");
    });

    it("TRADE HIDE returns 400 INVALID_ACTION", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "TRADE", targetId: "offer-1", actionType: "HIDE" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ACTION");
    });

    it("USER BAN sets UserModerationState isBanned", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "banned-user", actionType: "BAN", note: "Abuse" });
      expect(res.status).toBe(201);

      const state = await prisma.userModerationState.findUnique({ where: { userId: "banned-user" } });
      expect(state).not.toBeNull();
      expect(state!.isBanned).toBe(true);
      expect(state!.banReason).toBe("Abuse");
      expect(state!.bannedAt).not.toBeNull();
    });

    it("USER WARN increments warnCount", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "warned-user", actionType: "WARN" });
      await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "warned-user", actionType: "WARN" });

      const state = await prisma.userModerationState.findUnique({ where: { userId: "warned-user" } });
      expect(state).not.toBeNull();
      expect(state!.warnCount).toBe(2);
      expect(state!.lastWarnAt).not.toBeNull();
    });

    it("USER UNBAN clears isBanned", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      // BAN first
      await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "unban-user", actionType: "BAN", note: "Abuse" });

      const banned = await prisma.userModerationState.findUnique({ where: { userId: "unban-user" } });
      expect(banned!.isBanned).toBe(true);

      // UNBAN
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "unban-user", actionType: "UNBAN" });
      expect(res.status).toBe(201);

      const state = await prisma.userModerationState.findUnique({ where: { userId: "unban-user" } });
      expect(state).not.toBeNull();
      expect(state!.isBanned).toBe(false);
      expect(state!.banReason).toBeNull();
      expect(state!.bannedAt).toBeNull();
    });

    it("UNBAN on LISTING returns 400 INVALID_ACTION", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "LISTING", targetId: "some-listing", actionType: "UNBAN" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_ACTION");
    });

    it("UNBAN on never-banned user still returns 201", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);
      const res = await request(app)
        .post("/admin/moderation/actions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetType: "USER", targetId: "never-banned-user", actionType: "UNBAN" });
      expect(res.status).toBe(201);
      expect(res.body.data.action.actionType).toBe("UNBAN");
    });
  });

  describe("requireNotBanned (403 USER_BANNED)", () => {
    it("banned user gets 403 on POST /reports/listings/:id", async () => {
      await prisma.userModerationState.create({
        data: { userId: "banned-reporter", isBanned: true, bannedAt: new Date(), banReason: "Abuse" },
      });
      const listing = await createListing("seller-1");
      const token = makeToken("banned-reporter");

      const res = await request(app)
        .post(`/reports/listings/${listing.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ reason: "spam" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("USER_BANNED");
    });
  });

  // -----------------------------------------------------------------------
  // Reputation
  // -----------------------------------------------------------------------

  describe("GET /users/:id/reputation", () => {
    it("returns zeroed shape when no reputation exists", async () => {
      const res = await request(app).get("/users/unknown-user/reputation");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        score: 0,
        totalSales: 0,
        totalTrades: 0,
        disputesCount: 0,
        reportsCount: 0,
        updatedAt: null,
      });
    });

    it("returns existing reputation", async () => {
      await prisma.sellerReputation.create({
        data: {
          userId: "seller-1",
          score: 10,
          totalSales: 5,
          totalTrades: 5,
          disputesCount: 0,
          reportsCount: 0,
        },
      });

      const res = await request(app).get("/users/seller-1/reputation");
      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(10);
      expect(res.body.data.totalSales).toBe(5);
      expect(res.body.data.totalTrades).toBe(5);
    });
  });

  describe("POST /internal/reputation/recompute", () => {
    it("returns 403 for non-admin", async () => {
      const token = makeToken("user-1");
      const res = await request(app)
        .post("/internal/reputation/recompute")
        .set("Authorization", `Bearer ${token}`)
        .send({ userId: "seller-1" });
      expect(res.status).toBe(403);
    });

    it("computes reputation from existing data", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);

      // Create 2 SOLD listings for seller-1
      await prisma.listing.createMany({
        data: [
          { userId: "seller-1", title: "Card 1", priceCents: 100, game: "POKEMON", category: "CARD", language: "FR", condition: "NM", status: "SOLD" },
          { userId: "seller-1", title: "Card 2", priceCents: 200, game: "POKEMON", category: "CARD", language: "FR", condition: "NM", status: "SOLD" },
        ],
      });

      // Create 1 ACCEPTED trade where seller-1 is creator
      await prisma.tradeOffer.create({
        data: {
          creatorUserId: "seller-1",
          receiverUserId: "buyer-1",
          creatorItemsJson: { schemaVersion: 1, items: [] },
          receiverItemsJson: { schemaVersion: 1, items: [] },
          status: "ACCEPTED",
        },
      });

      const res = await request(app)
        .post("/internal/reputation/recompute")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: "seller-1" });
      expect(res.status).toBe(200);
      expect(res.body.data.totalSales).toBe(2);
      expect(res.body.data.totalTrades).toBe(1);
      expect(res.body.data.reportsCount).toBe(0);
      expect(res.body.data.score).toBe(3); // 2 + 1 - 0
    });

    it("recompute reportsCount counts OPEN reports against user listings only", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);

      const listing1 = await prisma.listing.create({
        data: { userId: "seller-reports", title: "L1", priceCents: 100, game: "POKEMON", category: "CARD", language: "FR", condition: "NM", status: "SOLD" },
      });
      const listing2 = await prisma.listing.create({
        data: { userId: "seller-reports", title: "L2", priceCents: 200, game: "POKEMON", category: "CARD", language: "FR", condition: "NM", status: "PUBLISHED" },
      });
      const otherListing = await prisma.listing.create({
        data: { userId: "other-seller", title: "L3", priceCents: 300, game: "POKEMON", category: "CARD", language: "FR", condition: "NM", status: "PUBLISHED" },
      });

      await prisma.listingReport.createMany({
        data: [
          { listingId: listing1.id, reporterUserId: "r1", reason: "r1", status: "OPEN", updatedAt: new Date() },
          { listingId: listing2.id, reporterUserId: "r2", reason: "r2", status: "OPEN", updatedAt: new Date() },
          { listingId: otherListing.id, reporterUserId: "r3", reason: "r3", status: "OPEN", updatedAt: new Date() },
        ],
      });

      const res = await request(app)
        .post("/internal/reputation/recompute")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: "seller-reports" });
      expect(res.status).toBe(200);
      expect(res.body.data.totalSales).toBe(1);
      expect(res.body.data.totalTrades).toBe(0);
      expect(res.body.data.reportsCount).toBe(2); // OPEN reports against seller-reports listings only
      expect(res.body.data.score).toBe(1 - 2 * 2); // 1 - 4 = -3
    });

    it("recompute totalTrades counts ACCEPTED as creator or receiver", async () => {
      const adminToken = makeToken("admin-1", ["ADMIN"]);

      await prisma.tradeOffer.createMany({
        data: [
          { creatorUserId: "trader-1", receiverUserId: "b", creatorItemsJson: { schemaVersion: 1 }, receiverItemsJson: { schemaVersion: 1 }, status: "ACCEPTED" },
          { creatorUserId: "a", receiverUserId: "trader-1", creatorItemsJson: { schemaVersion: 1 }, receiverItemsJson: { schemaVersion: 1 }, status: "ACCEPTED" },
          { creatorUserId: "trader-1", receiverUserId: "c", creatorItemsJson: { schemaVersion: 1 }, receiverItemsJson: { schemaVersion: 1 }, status: "PENDING" },
        ],
      });

      const res = await request(app)
        .post("/internal/reputation/recompute")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ userId: "trader-1" });
      expect(res.status).toBe(200);
      expect(res.body.data.totalSales).toBe(0);
      expect(res.body.data.totalTrades).toBe(2); // only ACCEPTED, as creator or receiver
      expect(res.body.data.reportsCount).toBe(0);
      expect(res.body.data.score).toBe(2);
    });
  });
});
