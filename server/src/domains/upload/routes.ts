import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";

const router = Router();

const uploadBodySchema = z.object({
  /** URL of image to analyze (future: OCR/IA service will fetch and process). */
  imageUrl: z.string().url().optional(),
  /** Base64 data URL (e.g. data:image/jpeg;base64,...) for inline upload. */
  imageDataUrl: z.string().max(5_000_000).optional(),
}).refine((data) => data.imageUrl ?? data.imageDataUrl, {
  message: "Provide imageUrl or imageDataUrl",
});

/**
 * POST /upload — Stub "suggestions" (not a real file upload).
 * Body: { imageUrl?: string, imageDataUrl?: string } (one required)
 * Returns suggested fields for listing form (cardId, cardName, condition, etc.).
 * No file is stored; this is for future OCR/IA integration. Real listing images use
 * POST /marketplace/listings/:id/images/presigned-upload + attach.
 */
router.post(
  "/upload",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = uploadBodySchema.parse(req.body);

    // TODO: call external OCR/IA service (e.g. vision API), then map result to suggested shape.
    const suggested = {
      cardId: null as string | null,
      cardName: null as string | null,
      setCode: null as string | null,
      condition: null as string | null,
      language: null as string | null,
      edition: null as string | null,
    };

    ok(res, { suggested });
  }),
);

export const uploadRoutes = router;
