import { Router } from "express";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  const user = (req as RequestWithUser).user;
  res.json({
    data: {
      userId: user.userId,
      username: user.username,
      firstName: user.firstName,
      email: user.email,
      isAdmin: user.isAdmin,
      roles: user.roles,
    },
  });
});

export const authRoutes = router;
