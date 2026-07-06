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
      let problem = await prisma.problem.findFirst();
      if (!problem) {
        problem = await prisma.problem.create({
          data: {
            title: "Find Duplicate Number",
            slug: "find-duplicate-number",
            difficulty: "MEDIUM",
            tags: ["array", "two-pointers"],
            visibility: "PUBLIC",
            versions: {
              create: {
                version: 1,
                statement: "Given an array of integers `nums` containing `n + 1` integers where each integer is in the range `[1, n]` inclusive.\n\nThere is only **one repeated number** in `nums`, return *this repeated number*.",
                constraints: "You must solve the problem **without** modifying the array `nums` and use only constant extra space.",
                timeLimit: 1000,
                memoryLimit: 256,
                examples: [
                  {
                    id: 1,
                    input: "[1,3,4,2,2]",
                    output: "2"
                  }
                ] as any,
                testCases: [
                  {
                    input: "[1,3,4,2,2]",
                    output: "2"
                  },
                  {
                    input: "[3,1,3,4,2]",
                    output: "3"
                  }
                ] as any,
                languages: {
                  javascript: {
                    template: "// type your code here\nconst fs = require('fs');\n"
                  },
                  typescript: {
                    template: "// type your code here\nimport * as fs = require('fs');\n"
                  },
                  python: {
                    template: "# type your code here\nimport sys\nimport json\n"
                  },
                  "c++": {
                    template: "// type your code here\n#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\nusing namespace std;\n"
                  },
                  java: {
                    template: "// type your code here\nimport java.util.*;\nimport java.io.*;\n"
                  }
                } as any
              }
            }
          }
        });
      }
      problemId = problem.id;
    } catch (err) {
      console.error("Failed to seed default problem on allocator:", err);
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
