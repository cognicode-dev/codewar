import { Router } from "express";
import { authMiddleware } from "../../auth/middleware/auth.middleware";
import { SocialController } from "../controller/social.controller";

const router: Router = Router();
const socialController = new SocialController();

// Require authentication for all social/relationship routes
router.use(authMiddleware as any);

router.get("/friends", socialController.getFriends);
router.delete("/friends/:friendId", socialController.removeFriend);

router.get("/requests", socialController.getRequests);
router.post("/requests", socialController.sendFriendRequest);
router.post("/requests/:id/accept", socialController.acceptFriendRequest);
router.post("/requests/:id/decline", socialController.declineFriendRequest);

router.get("/search", socialController.searchUsers);

export default router;
