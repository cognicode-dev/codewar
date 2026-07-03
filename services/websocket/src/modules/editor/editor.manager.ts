import { EditorStateDTO, EditorOperationDTO } from "@coding-arena/api-contracts";
import { EditorEngine } from "./editor.engine";

export class EditorManager {
  private editors = new Map<string, EditorStateDTO>();
  private operationLogs = new Map<string, EditorOperationDTO[]>();
  private engine = new EditorEngine();

  public getOrCreateEditor(roomId: string): EditorStateDTO {
    let editor = this.editors.get(roomId);

    if (!editor) {
      editor = {
        roomId,
        content: "",
        version: 0,
        updatedAt: new Date().toISOString()
      };
      this.editors.set(roomId, editor);
      this.operationLogs.set(roomId, []);
    }

    return editor;
  }

  public applyOperation(
    roomId: string,
    userId: string,
    opInput: { id: string; baseVersion: number; index: number; text: string; type: "insert" | "delete" }
  ): { roomState: EditorStateDTO; appliedOp: EditorOperationDTO } {
    const editor = this.getOrCreateEditor(roomId);
    let log = this.operationLogs.get(roomId);
    if (!log) {
      log = [];
      this.operationLogs.set(roomId, log);
    }

    let op: EditorOperationDTO = {
      id: opInput.id,
      userId,
      roomId,
      baseVersion: opInput.baseVersion,
      version: 0,
      timestamp: new Date().toISOString(),
      type: opInput.type,
      index: opInput.index,
      text: opInput.text
    };

    if (op.baseVersion < editor.version) {
      const intermediateOps = log.slice(op.baseVersion);
      for (const appliedOp of intermediateOps) {
        op = this.engine.transform(op, appliedOp);
      }
    } else if (op.baseVersion > editor.version) {
      throw new Error(`Client baseVersion ${op.baseVersion} is in the future. Current version: ${editor.version}`);
    }

    editor.content = this.engine.apply(editor.content, op.type, op.index, op.text);
    editor.version += 1;
    op.version = editor.version;
    editor.updatedAt = op.timestamp;

    log.push(op);

    return { roomState: editor, appliedOp: op };
  }

  public getEditorState(roomId: string): EditorStateDTO | null {
    return this.editors.get(roomId) || null;
  }

  public getOperationLog(roomId: string): EditorOperationDTO[] {
    return this.operationLogs.get(roomId) || [];
  }

  public deleteEditor(roomId: string): void {
    this.editors.delete(roomId);
    this.operationLogs.delete(roomId);
  }
}
