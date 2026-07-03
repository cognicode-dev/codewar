import { EditorStateDTO, EditorOperationDTO } from "@coding-arena/api-contracts";

export class EditorManager {
  private editors = new Map<string, EditorStateDTO>();

  public getOrCreateEditor(roomId: string): EditorStateDTO {
    let editor = this.editors.get(roomId);

    if (!editor) {
      editor = {
        roomId,
        content: "",
        version: 0,
        updatedAt: new Date().toISOString(),
      };
      this.editors.set(roomId, editor);
    }

    return editor;
  }

  public applyOperation(
    roomId: string,
    userId: string,
    op: { index: number; text: string; type: "insert" | "delete" },
  ): { roomState: EditorStateDTO; appliedOp: EditorOperationDTO } {
    const editor = this.getOrCreateEditor(roomId);

    const { index, text, type } = op;

    if (index < 0 || index > editor.content.length) {
      throw new Error(
        `Invalid operation index: ${index}. Document length: ${editor.content.length}`,
      );
    }

    let newContent = "";
    if (type === "insert") {
      newContent = editor.content.slice(0, index) + text + editor.content.slice(index);
    } else if (type === "delete") {
      if (index + text.length > editor.content.length) {
        throw new Error(
          `Invalid deletion length. Cannot delete ${text.length} characters starting from index ${index}.`,
        );
      }
      const deletedTargetText = editor.content.slice(index, index + text.length);
      if (deletedTargetText !== text) {
        throw new Error(
          `Desynchronization warning: text to delete '${text}' does not match target text '${deletedTargetText}'`,
        );
      }
      newContent = editor.content.slice(0, index) + editor.content.slice(index + text.length);
    } else {
      throw new Error(`Unsupported operation type: ${type}`);
    }

    editor.content = newContent;
    editor.version += 1;
    editor.updatedAt = new Date().toISOString();

    const appliedOp: EditorOperationDTO = {
      userId,
      roomId,
      version: editor.version,
      index,
      text,
      type,
    };

    return { roomState: editor, appliedOp };
  }

  public getEditorState(roomId: string): EditorStateDTO | null {
    return this.editors.get(roomId) || null;
  }

  public deleteEditor(roomId: string): void {
    this.editors.delete(roomId);
  }
}
