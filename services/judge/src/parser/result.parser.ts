export enum JudgeStatus {
  ACCEPTED = "ACCEPTED",
  WRONG_ANSWER = "WRONG_ANSWER",
  COMPILATION_ERROR = "COMPILATION_ERROR",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  TIME_LIMIT_EXCEEDED = "TIME_LIMIT_EXCEEDED",
  MEMORY_LIMIT_EXCEEDED = "MEMORY_LIMIT_EXCEEDED",
}

export class ResultParser {
  private normalize(str: string): string {
    return str
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line, index, arr) => {
        if (line === "") {
          return arr.slice(index).some((l) => l.trimEnd() !== "");
        }
        return true;
      })
      .join("\n")
      .trimEnd();
  }

  public compare(actual: string, expected: string): JudgeStatus {
    const normActual = this.normalize(actual);
    const normExpected = this.normalize(expected);

    return normActual === normExpected ? JudgeStatus.ACCEPTED : JudgeStatus.WRONG_ANSWER;
  }
}
