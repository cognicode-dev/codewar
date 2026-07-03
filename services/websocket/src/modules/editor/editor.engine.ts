import { EditorOperationDTO } from "@coding-arena/api-contracts";

export class EditorEngine {
  public apply(content: string, type: "insert" | "delete", index: number, text: string): string {
    if (index < 0 || index > content.length) {
      throw new Error(`Invalid index ${index} for content of length ${content.length}`);
    }

    if (type === "insert") {
      return content.slice(0, index) + text + content.slice(index);
    } else if (type === "delete") {
      if (index + text.length > content.length) {
        throw new Error(`Invalid deletion length. Cannot delete ${text.length} characters starting from index ${index}.`);
      }
      return content.slice(0, index) + content.slice(index + text.length);
    }

    throw new Error(`Unsupported operation type: ${type}`);
  }

  public transform(op: EditorOperationDTO, appliedOp: EditorOperationDTO): EditorOperationDTO {
    const transformed = { ...op };

    if (appliedOp.type === "insert") {
      if (appliedOp.index < op.index) {
        transformed.index += appliedOp.text.length;
      } else if (appliedOp.index === op.index) {
        if (appliedOp.userId < op.userId) {
          transformed.index += appliedOp.text.length;
        }
      }
    } else if (appliedOp.type === "delete") {
      const deleteLen = appliedOp.text.length;
      const deleteStart = appliedOp.index;
      const deleteEnd = deleteStart + deleteLen;

      if (deleteEnd <= op.index) {
        transformed.index -= deleteLen;
      } else if (deleteStart < op.index) {
        transformed.index = deleteStart;
      }
    }

    transformed.baseVersion = appliedOp.version;

    return transformed;
  }
}
