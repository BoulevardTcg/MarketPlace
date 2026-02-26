import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { paginationQuerySchema, decodeCursor, buildPage } from "../../shared/http/pagination.js";

const router = Router();

const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unread: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const markReadBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

// GET /notifications — list user notifications (unread first, then by createdAt DESC)
router.get(
  "/notifications",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = listNotificationsQuerySchema.parse(req.query);
    const { cursor, limit, unread } = query;

    const where: Prisma.NotificationWhereInput = { userId };
    if (unread) where.isRead = false;

    if (cursor) {
      const c = decodeCursor(cursor);
      where.AND = {
        OR: [
          { createdAt: { lt: new Date(c.v as string) } },
          { createdAt: new Date(c.v as string), id: { lt: c.id as string } },
        ],
      };
    }

    const items = await prisma.notification.findMany({
      where,
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.createdAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// GET /notifications/unread-count — fast badge count
router.get(
  "/notifications/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const count = await prisma.notification.count({ where: { userId, isRead: false } });
    ok(res, { count });
  }),
);

// POST /notifications/read — mark specific notifications as read
router.post(
  "/notifications/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const body = markReadBodySchema.parse(req.body ?? {});

    await prisma.notification.updateMany({
      where: { id: { in: body.ids }, userId },
      data: { isRead: true },
    });

    ok(res, { ok: true });
  }),
);

// POST /notifications/read-all — mark all as read
router.post(
  "/notifications/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    ok(res, { ok: true });
  }),
);

// DELETE /notifications/:id — delete one notification (owner only)
router.delete(
  "/notifications/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const notifId = req.params.id;

    const notif = await prisma.notification.findUnique({ where: { id: notifId } });
    if (!notif) throw new AppError("NOT_FOUND", "Notification not found", 404);
    if (notif.userId !== userId) throw new AppError("FORBIDDEN", "Not allowed", 403);

    await prisma.notification.delete({ where: { id: notifId } });
    ok(res, { ok: true });
  }),
);

export const notificationsRoutes = router;
