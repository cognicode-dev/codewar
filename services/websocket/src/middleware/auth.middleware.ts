import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "@coding-arena/config";

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token || typeof token !== "string") {
    next(new Error("Authentication error: Token is required"));
    return;
  }

  try {
    const decoded = jwt.verify(token, env.jwtAccessSecret) as { sub: string; username: string };

    socket.data.userId = decoded.sub;
    socket.data.username = decoded.username;

    next();
  } catch (error) {
    next(new Error("Authentication error: Invalid or expired token"));
  }
};
