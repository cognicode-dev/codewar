import { prisma } from "@coding-arena/database";
import { EditorEngine } from "../editor/editor.engine";

export interface ReplayFrame {
  id: string;
  type: string;
  data: any;
  offsetMs: number;
  timestamp: string;
}

export interface ReplayData {
  matchId: string;
  roomId: string;
  problemId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  events: ReplayFrame[];
}

export interface PlaybackSnapshot {
  matchId: string;
  offsetMs: number;
  editorContent: string;
  editorVersion: number;
  lastEditedBy: string | null;
  eventsApplied: ReplayFrame[];
}

export class ReplayService {
  private editorEngine = new EditorEngine();

  /**
   * Retrieves match information and compiles its event timeline with relative millisecond offsets.
   */
  public async getReplayData(matchId: string): Promise<ReplayData> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        timeline: {
          orderBy: { timestamp: "asc" }
        }
      }
    });

    if (!match) {
      throw new Error("Match not found");
    }

    const timelineEvents = match.timeline;
    if (timelineEvents.length === 0) {
      return {
        matchId: match.id,
        roomId: match.roomId,
        problemId: match.problemId,
        startedAt: match.startedAt?.toISOString() || match.createdAt.toISOString(),
        endedAt: match.finishedAt?.toISOString() || match.abortedAt?.toISOString() || null,
        durationMs: 0,
        events: []
      };
    }

    const startTimestamp = match.startedAt ? match.startedAt.getTime() : timelineEvents[0].timestamp.getTime();
    const endTimestamp = match.finishedAt?.getTime() || match.abortedAt?.getTime() || timelineEvents[timelineEvents.length - 1].timestamp.getTime();

    const frames: ReplayFrame[] = timelineEvents.map((ev) => {
      const offsetMs = Math.max(0, ev.timestamp.getTime() - startTimestamp);
      return {
        id: ev.id,
        type: ev.type,
        data: ev.data,
        offsetMs,
        timestamp: ev.timestamp.toISOString()
      };
    });

    return {
      matchId: match.id,
      roomId: match.roomId,
      problemId: match.problemId,
      startedAt: new Date(startTimestamp).toISOString(),
      endedAt: new Date(endTimestamp).toISOString(),
      durationMs: Math.max(0, endTimestamp - startTimestamp),
      events: frames
    };
  }

  /**
   * Evaluates the event stream up to targetOffsetMs, applying OT ops sequentially to construct the document state.
   */
  public getPlaybackStateAt(replayData: ReplayData, targetOffsetMs: number): PlaybackSnapshot {
    const pastEvents = replayData.events.filter((ev) => ev.offsetMs <= targetOffsetMs);

    // 1. Gather all collaborative editor edits applied up to this point
    const editorOps = pastEvents
      .filter((ev) => ev.type === "EDITOR_OPERATION_APPLIED")
      .map((ev) => ev.data.appliedOp)
      // Sort in-order by document version numbers
      .sort((a, b) => a.version - b.version);

    let content = "";
    let version = 0;
    let lastEditedBy: string | null = null;

    // 2. Compute final document state by running OT transforms in chronological order
    for (const op of editorOps) {
      content = this.editorEngine.apply(content, op.type, op.index, op.text);
      version = op.version;
      lastEditedBy = op.userId;
    }

    // 3. Keep non-edit events for history log tracking (e.g. submissions, count-down, match results)
    const logs = pastEvents.filter((ev) => ev.type !== "EDITOR_OPERATION_APPLIED");

    return {
      matchId: replayData.matchId,
      offsetMs: targetOffsetMs,
      editorContent: content,
      editorVersion: version,
      lastEditedBy,
      eventsApplied: logs
    };
  }
}
