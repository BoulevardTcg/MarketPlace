import { Router } from "express";
import { z } from "zod";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { requireNotBanned } from "../../shared/auth/requireNotBanned.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";

const router = Router();

const patchProfileSchema = z
  .object({
    username: z.string().min(1).max(80).optional(),
    avatarUrl: z.string().url().max(500).optional().nullable(),
    bio: z.string().max(500).optional().nullable(),
    country: z.string().max(10).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// GET /users/me/profile — requireAuth, returns current user profile (create stub if missing)
router.get(
  "/users/me/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    let profile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          userId,
          username: userId.slice(0, 12),
        },
      });
    }
    ok(res, profile);
  }),
);

// PATCH /users/me/profile — requireAuth, partial update (owner only)
router.patch(
  "/users/me/profile",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const body = patchProfileSchema.parse(req.body);

    const profile = await prisma.userProfile.upsert({
      where: { userId },
      update: {
        ...(body.username !== undefined && { username: body.username }),
        ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl }),
        ...(body.bio !== undefined && { bio: body.bio }),
        ...(body.country !== undefined && { country: body.country }),
        updatedAt: new Date(),
      },
      create: {
        userId,
        username: body.username ?? userId.slice(0, 12),
        avatarUrl: body.avatarUrl ?? null,
        bio: body.bio ?? null,
        country: body.country ?? null,
      },
    });

    ok(res, profile);
  }),
);

// GET /users/:id/profile — public, returns profile by userId (404 if not found)
router.get(
  "/users/:id/profile",
  asyncHandler(async (req, res) => {
    const userId = req.params.id;
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new AppError("NOT_FOUND", "Profile not found", 404);
    ok(res, profile);
  }),
);

export const profileRoutes = router;
