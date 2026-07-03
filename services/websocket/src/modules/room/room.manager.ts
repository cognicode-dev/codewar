import { RoomStateDTO, RoomStatus, ParticipantDTO } from "@coding-arena/api-contracts";
import crypto from "crypto";

export class RoomManager {
  private rooms = new Map<string, RoomStateDTO>();

  public createRoom(
    hostId: string,
    hostUsername: string,
    problemId: string | null = null,
    name?: string,
  ): RoomStateDTO {
    const roomId = crypto.randomUUID();
    const joinedAt = new Date().toISOString();

    const hostParticipant: ParticipantDTO = {
      userId: hostId,
      username: hostUsername,
      isReady: true,
      joinedAt,
    };

    const room: RoomStateDTO = {
      id: roomId,
      name: name || `Room of ${hostUsername}`,
      hostId,
      status: RoomStatus.LOBBY,
      problemId,
      participants: {
        [hostId]: hostParticipant,
      },
      createdAt: new Date().toISOString(),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  public getRoom(roomId: string): RoomStateDTO | null {
    return this.rooms.get(roomId) || null;
  }

  public joinRoom(roomId: string, userId: string, username: string): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.status !== RoomStatus.LOBBY) {
      throw new Error("Cannot join a room that has already started or finished");
    }

    if (room.participants[userId]) {
      return room;
    }

    const participant: ParticipantDTO = {
      userId,
      username,
      isReady: false,
      joinedAt: new Date().toISOString(),
    };

    room.participants[userId] = participant;
    return room;
  }

  public leaveRoom(roomId: string, userId: string): RoomStateDTO | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (!room.participants[userId]) return room;

    delete room.participants[userId];

    const remainingUserIds = Object.keys(room.participants);
    if (remainingUserIds.length === 0) {
      this.rooms.delete(roomId);
      return null;
    }

    if (room.hostId === userId) {
      const newHostId = remainingUserIds[0];
      room.hostId = newHostId;
      if (room.participants[newHostId]) {
        room.participants[newHostId].isReady = true;
      }
    }

    return room;
  }

  public toggleReady(roomId: string, userId: string): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.status !== RoomStatus.LOBBY) {
      throw new Error("Cannot change ready status during a match");
    }

    const participant = room.participants[userId];
    if (!participant) {
      throw new Error("Participant not in room");
    }

    participant.isReady = !participant.isReady;
    return room;
  }

  public setProblem(roomId: string, problemId: string | null): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    room.problemId = problemId;
    return room;
  }

  public setStatus(roomId: string, status: RoomStatus): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    room.status = status;
    return room;
  }
}
