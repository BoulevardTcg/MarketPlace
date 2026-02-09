import { Router } from "express";
import { z } from "zod";
import { UserProfileType } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { prisma } from "../../shared/db/prisma.js";

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────

const VALID_PROFILE_TYPES = Object.values(UserProfileType);

const putProfilesSchema = z.object({
  profiles: z
    .array(z.nativeEnum(UserProfileType))
    .min(0)
    .max(VALID_PROFILE_TYPES.length)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Duplicate profile types are not allowed",
    }),
});

// ─── Routes ───────────────────────────────────────────────────

/** GET /users/me/profiles — list the authenticated user's enabled profile types */
router.get(
  "/users/me/profiles",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;

    const active = await prisma.userActiveProfile.findMany({
      where: { userId },
      select: { profileType: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    ok(res, {
      profiles: active.map((p) => p.profileType),
      available: VALID_PROFILE_TYPES,
    });
  }),
);

/** PUT /users/me/profiles — idempotent set of enabled profile types */
router.put(
  "/users/me/profiles",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const body = putProfilesSchema.parse(req.body);
    const desired = new Set(body.profiles);

    const current = await prisma.userActiveProfile.findMany({
      where: { userId },
      select: { id: true, profileType: true },
    });
    const currentSet = new Set(current.map((p) => p.profileType));

    const toAdd = body.profiles.filter((p) => !currentSet.has(p));
    const toRemove = current.filter((p) => !desired.has(p.profileType));

    await prisma.$transaction([
      ...toRemove.map((p) =>
        prisma.userActiveProfile.delete({ where: { id: p.id } }),
      ),
      ...toAdd.map((profileType) =>
        prisma.userActiveProfile.create({
          data: { userId, profileType },
        }),
      ),
    ]);

    const updated = await prisma.userActiveProfile.findMany({
      where: { userId },
      select: { profileType: true },
      orderBy: { createdAt: "asc" },
    });

    ok(res, {
      profiles: updated.map((p) => p.profileType),
      available: VALID_PROFILE_TYPES,
    });
  }),
);

export const profileTypesRoutes = router;
