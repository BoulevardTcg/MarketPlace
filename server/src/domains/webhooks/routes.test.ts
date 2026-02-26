import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import app from "../../app.js";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "test-webhook-secret";

function makeSignature(body: string, secret = WEBHOOK_SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex");
}

function makePayload(overrides: Record<string, unknown> = {}): {
  body: string;
  json: Record<string, unknown>;
} {
  const json = {
    eventId: `evt-${Date.now()}-${Math.random()}`,
    listingId: "listing-placeholder",
    orderId: "order-placeholder",
    status: "paid",
    timestamp: Date.now(),
    ...overrides,
  };
  return { body: JSON.stringify(json), json };
}

const SELLER = "webhook-seller";
const BUYER = "webhook-buyer";

async function setupListingAndOrder(overrides: {
  listingStatus?: string;
  orderStatus?: string;
} = {}) {
  const listing = await prisma.listing.create({
    data: {
      userId: SELLER,
      title: "Webhook Test Card",
      priceCents: 2000,
      category: "CARD",
      game: "POKEMON",
      language: "FR",
      condition: "NM",
      status: (overrides.listingStatus as never) ?? "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const order = await prisma.purchaseOrder.create({
    data: {
      buyerUserId: BUYER,
      listingId: listing.id,
      priceCents: listing.priceCents,
      currency: "EUR",
      status: (overrides.orderStatus as never) ?? "PENDING",
    },
  });
  return { listing, order };
}

describe("Webhooks - Payment", () => {
  beforeAll(async () => {
    await prisma.$connect();
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST /webhooks/payment without signature returns 401", async () => {
    const { body } = makePayload();
    const res = await request(app)
      .post("/webhooks/payment")
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(401);
  });

  it("POST /webhooks/payment with invalid signature returns 401", async () => {
    const { body } = makePayload();
    const res = await request(app)
      .post("/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", "sha256=invalidsignature")
      .send(body);
    expect(res.status).toBe(401);
  });

  it("POST /webhooks/payment with stale timestamp returns 400", async () => {
    const staleTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const { listing, order } = await setupListingAndOrder();
    const { body } = makePayload({
      listingId: listing.id,
      orderId: order.id,
      timestamp: staleTimestamp,
    });
    const sig = makeSignature(body);
    const res = await request(app)
      .post("/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("POST /webhooks/payment with valid 'paid' webhook marks listing SOLD and order COMPLETED", async () => {
    const { listing, order } = await setupListingAndOrder();
    const { body } = makePayload({ listingId: listing.id, orderId: order.id });
    const sig = makeSignature(body);

    const res = await request(app)
      .post("/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);

    const updatedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updatedListing?.status).toBe("SOLD");

    const updatedOrder = await prisma.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("COMPLETED");

    // Both buyer and seller get notifications
    const notifications = await prisma.notification.findMany({ orderBy: { createdAt: "asc" } });
    expect(notifications.length).toBeGreaterThanOrEqual(2);
    const types = notifications.map((n) => n.type);
    expect(types).toContain("PURCHASE_ORDER_COMPLETED");
    expect(types).toContain("LISTING_SOLD");
  });

  it("POST /webhooks/payment is idempotent with same eventId", async () => {
    const { listing, order } = await setupListingAndOrder();
    const eventId = `evt-idempotent-${Date.now()}`;
    const { body } = makePayload({ listingId: listing.id, orderId: order.id, eventId });
    const sig = makeSignature(body);

    // First call
    await request(app)
      .post("/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(body);

    // Second call — should be skipped
    const res2 = await request(app)
      .post("/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(body);

    expect(res2.status).toBe(200);
    expect(res2.body.data.skipped).toBe(true);

    // Should only have processed once
    const orders = await prisma.purchaseOrder.findMany({ where: { id: order.id } });
    expect(orders[0].status).toBe("COMPLETED");
  });

  it("POST /webhooks/payment with 'failed' status marks order FAILED", async () => {
    const { listing, order } = await setupListingAndOrder();
    const { body } = makePayload({ listingId: listing.id, orderId: order.id, status: "failed" });
    const sig = makeSignature(body);

    const res = await request(app)
      .post("/webhooks/payment")
      .set("Content-Type", "application/json")
      .set("x-webhook-signature", sig)
      .send(body);

    expect(res.status).toBe(200);

    const updatedOrder = await prisma.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe("FAILED");

    // Listing should still be PUBLISHED
    const updatedListing = await prisma.listing.findUnique({ where: { id: listing.id } });
    expect(updatedListing?.status).toBe("PUBLISHED");

    // Buyer gets cancellation notification
    const notifications = await prisma.notification.findMany({ where: { userId: BUYER } });
    expect(notifications.some((n) => n.type === "PURCHASE_ORDER_CANCELLED")).toBe(true);
  });
});
