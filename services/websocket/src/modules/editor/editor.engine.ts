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
    let transformed = { ...op };

    if (op.type === "insert" && appliedOp.type === "insert") {
      transformed = this.transformInsertInsert(transformed, appliedOp);
    } else if (op.type === "insert" && appliedOp.type === "delete") {
      transformed = this.transformInsertDelete(transformed, appliedOp);
    } else if (op.type === "delete" && appliedOp.type === "insert") {
      transformed = this.transformDeleteInsert(transformed, appliedOp);
    } else if (op.type === "delete" && appliedOp.type === "delete") {
      transformed = this.transformDeleteDelete(transformed, appliedOp);
    }

    transformed.baseVersion = appliedOp.version;
    return transformed;
  }

  private transformInsertInsert(op: EditorOperationDTO, appliedOp: EditorOperationDTO): EditorOperationDTO {
    const res = { ...op };
    if (appliedOp.index < op.index) {
      res.index += appliedOp.text.length;
    } else if (appliedOp.index === op.index) {
      if (appliedOp.userId < op.userId) {
        res.index += appliedOp.text.length;
      }
    }
    return res;
  }

  private transformInsertDelete(op: EditorOperationDTO, appliedOp: EditorOperationDTO): EditorOperationDTO {
    const res = { ...op };
    const deleteLen = appliedOp.text.length;
    const deleteStart = appliedOp.index;
    const deleteEnd = deleteStart + deleteLen;

    if (deleteEnd <= op.index) {
      res.index -= deleteLen;
    } else if (deleteStart < op.index) {
      res.index = deleteStart;
    }
    return res;
  }

  private transformDeleteInsert(op: EditorOperationDTO, appliedOp: EditorOperationDTO): EditorOperationDTO {
    const res = { ...op };
    if (appliedOp.index <= op.index) {
      res.index += appliedOp.text.length;
    }
    return res;
  }

  private transformDeleteDelete(op: EditorOperationDTO, appliedOp: EditorOperationDTO): EditorOperationDTO {
    const res = { ...op };
    const deleteLen = appliedOp.text.length;
    const deleteStart = appliedOp.index;
    const deleteEnd = deleteStart + deleteLen;

    if (deleteEnd <= op.index) {
      res.index -= deleteLen;
    } else if (deleteStart < op.index) {
      res.index = deleteStart;
    }
    return res;
  }
}
