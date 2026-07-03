import { Socket, Server } from "socket.io";
import { EventEnvelope } from "@coding-arena/api-contracts";

export class ConnectionRegistry {
  private userSockets = new Map<string, Set<Socket>>();

  public register(userId: string, socket: Socket): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket);
  }

  public deregister(userId: string, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socket of sockets) {
        if (socket.id === socketId) {
          sockets.delete(socket);
          break;
        }
      }
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  public sendToUser<T>(userId: string, event: string, payload: T, correlationId?: string): void {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      const envelope: EventEnvelope<T> = {
        event,
        timestamp: new Date().toISOString(),
        correlationId,
        payload,
      };

      for (const socket of sockets) {
        socket.emit(event, envelope);
      }
    }
  }

  public sendToRoom<T>(
    io: Server,
    roomId: string,
    event: string,
    payload: T,
    correlationId?: string,
  ): void {
    const envelope: EventEnvelope<T> = {
      event,
      timestamp: new Date().toISOString(),
      correlationId,
      payload,
    };

    io.to(`room:${roomId}`).emit(event, envelope);
  }

  public disconnectUser(userId: string): void {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socket of sockets) {
        socket.disconnect(true);
      }
      this.userSockets.delete(userId);
    }
  }

  public getSocketsForUser(userId: string): Set<Socket> | null {
    return this.userSockets.get(userId) || null;
  }
}
