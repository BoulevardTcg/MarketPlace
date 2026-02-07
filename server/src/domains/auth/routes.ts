import { Router } from "express";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  const user = (req as RequestWithUser).user;
  res.json({ data: { userId: user.userId } });
});

export const authRoutes = router;
