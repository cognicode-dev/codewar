import { RoomStateDTO, RoomStatus, ParticipantDTO } from "@coding-arena/api-contracts";
import crypto from "crypto";

export class RoomManager {
  private rooms = new Map<string, RoomStateDTO>();

  public createRoom(
    hostId: string,
    hostUsername: string,
    problemId: string | null = null,
    name?: string
  ): RoomStateDTO {
    const roomId = crypto.randomUUID();
    const joinedAt = new Date().toISOString();

    const hostParticipant: ParticipantDTO = {
      userId: hostId,
      username: hostUsername,
      isReady: true,
      isConnected: true,
      team: null,
      joinedAt
    };

    const room: RoomStateDTO = {
      id: roomId,
      name: name || `Room of ${hostUsername}`,
      hostId,
      status: RoomStatus.CREATED,
      problemId,
      participants: {
        [hostId]: hostParticipant
      },
      currentMatchId: null,
      pastMatchIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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

    if (room.status === RoomStatus.CLOSED) {
      throw new Error("Cannot join a room that is closed");
    }

    if (room.status === RoomStatus.MATCH_IN_PROGRESS) {
      throw new Error("Cannot join a room during an active match");
    }

    if (room.participants[userId]) {
      room.participants[userId].isConnected = true;
      room.updatedAt = new Date().toISOString();
      return room;
    }

    const participant: ParticipantDTO = {
      userId,
      username,
      isReady: false,
      isConnected: true,
      team: null,
      joinedAt: new Date().toISOString()
    };

    room.participants[userId] = participant;

    if (room.status === RoomStatus.CREATED) {
      room.status = RoomStatus.WAITING;
    }

    room.updatedAt = new Date().toISOString();
    return room;
  }

  public leaveRoom(roomId: string, userId: string): RoomStateDTO | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    if (!room.participants[userId]) return room;

    delete room.participants[userId];

    const remainingUserIds = Object.keys(room.participants);
    if (remainingUserIds.length === 0) {
      room.status = RoomStatus.CLOSED;
      room.updatedAt = new Date().toISOString();
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

    room.updatedAt = new Date().toISOString();
    return room;
  }

  public toggleReady(roomId: string, userId: string): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.status !== RoomStatus.CREATED && room.status !== RoomStatus.WAITING) {
      throw new Error("Cannot change ready status during match countdown or active matches");
    }

    const participant = room.participants[userId];
    if (!participant) {
      throw new Error("Participant not in room");
    }

    participant.isReady = !participant.isReady;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  public setUserConnectionStatus(
    roomId: string,
    userId: string,
    isConnected: boolean
  ): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    const participant = room.participants[userId];
    if (participant) {
      participant.isConnected = isConnected;
    }

    room.updatedAt = new Date().toISOString();
    return room;
  }

  public selectProblem(roomId: string, hostId: string, problemId: string): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.hostId !== hostId) {
      throw new Error("Only the host can select a problem");
    }
    if (room.status !== RoomStatus.CREATED && room.status !== RoomStatus.WAITING) {
      throw new Error("Cannot select a problem during match countdown or active matches");
    }
    room.problemId = problemId;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  public assignTeam(
    roomId: string,
    userId: string,
    team: "red" | "blue" | "spectator" | null
  ): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.status !== RoomStatus.CREATED && room.status !== RoomStatus.WAITING) {
      throw new Error("Cannot assign team during match countdown or active matches");
    }
    const participant = room.participants[userId];
    if (!participant) {
      throw new Error("Participant not in room");
    }
    participant.team = team;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  public startMatchSession(roomId: string, matchId: string): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    room.status = RoomStatus.MATCH_IN_PROGRESS;
    room.currentMatchId = matchId;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  public finishMatchSession(roomId: string): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.currentMatchId) {
      room.pastMatchIds.push(room.currentMatchId);
    }
    room.status = RoomStatus.WAITING;
    room.currentMatchId = null;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  public abortMatchSession(roomId: string): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.currentMatchId) {
      room.pastMatchIds.push(room.currentMatchId);
    }
    room.status = RoomStatus.WAITING;
    room.currentMatchId = null;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  public setProblem(roomId: string, problemId: string | null): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    room.problemId = problemId;
    room.updatedAt = new Date().toISOString();
    return room;
  }

  public setStatus(roomId: string, status: RoomStatus): RoomStateDTO {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    room.status = status;
    room.updatedAt = new Date().toISOString();
    return room;
  }
}
