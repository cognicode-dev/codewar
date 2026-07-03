import { RoomManager } from "../room/room.manager";
import { RoomStateDTO } from "@coding-arena/api-contracts";
import { prisma } from "@coding-arena/database";
import { SessionManager } from "../session/session.manager";
import { ConnectionRegistry } from "../../registry/connection.registry";

export class RoomAllocator {
  constructor(
    private roomManager: RoomManager,
    private sessionManager: SessionManager,
    private connectionRegistry: ConnectionRegistry
  ) {}

  /**
   * Allocates a room, joins all matched players, assigns them to their teams,
   * updates sessions, and binds sockets to the room channel.
   */
  public async allocate(
    players: { id: string; username: string }[],
    teamAssignments: { redTeam: string[]; blueTeam: string[] }
  ): Promise<RoomStateDTO> {
    if (players.length === 0) {
      throw new Error("Cannot allocate room for empty players list");
    }

    let problemId = "prob-xyz";
    try {
      const problem = await prisma.problem.findFirst();
      if (problem) {
        problemId = problem.id;
      }
    } catch {
      // Fallback
    }

    const host = players[0];
    const room = this.roomManager.createRoom(
      host.id,
      host.username,
      problemId,
      "Matchmaking Match"
    );

    const roomId = room.id;

    // Joins remaining players to the allocated room
    for (let i = 1; i < players.length; i++) {
      const player = players[i];
      this.roomManager.joinRoom(roomId, player.id, player.username);
    }

    // Assign team alignments, update session manager, and join socket channel
    for (const player of players) {
      const team = teamAssignments.redTeam.includes(player.id)
        ? "red"
        : teamAssignments.blueTeam.includes(player.id)
        ? "blue"
        : "spectator";
      this.roomManager.assignTeam(roomId, player.id, team);

      // Link player to this room in the session manager
      this.sessionManager.joinRoom(player.id, roomId);

      // Add their active socket connections to the socket.io room channel
      const sockets = this.connectionRegistry.getSocketsForUser(player.id);
      if (sockets) {
        for (const s of sockets) {
          s.join(`room:${roomId}`);
        }
      }
    }

    return this.roomManager.getRoom(roomId)!;
  }
}
