import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../auth/middleware/auth.middleware";
import { SocialService } from "../service/social.service";

export class SocialController {
  private socialService = new SocialService();

  getFriends = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const friends = await this.socialService.getFriends(userId);
      res.json(friends);
    } catch (error) {
      next(error);
    }
  };

  getRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const requests = await this.socialService.getRequests(userId);
      res.json(requests);
    } catch (error) {
      next(error);
    }
  };

  sendFriendRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { targetUsername } = req.body;
      if (!targetUsername) {
        return res.status(400).json({ error: "targetUsername is required" });
      }
      const result = await this.socialService.sendFriendRequest(userId, targetUsername);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  acceptFriendRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;
      const result = await this.socialService.acceptFriendRequest(userId, id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  declineFriendRequest = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;
      const result = await this.socialService.declineFriendRequest(userId, id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  removeFriend = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { friendId } = req.params;
      const result = await this.socialService.removeFriend(userId, friendId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  searchUsers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { query } = req.query;
      const result = await this.socialService.searchUsers(userId, String(query || ""));
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
export default SocialController;
