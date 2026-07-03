import { exec } from "child_process";
import { promisify } from "util";
import { LanguageDefinition } from "../registry/language.registry";

const execAsync = promisify(exec);

export interface CompilationResult {
  success: boolean;
  stderr: string;
  outputBinaryPath: string;
}

export class CompilerService {
  async compile(
    runDir: string,
    sourceFilename: string,
    outputFilename: string,
    langDef: LanguageDefinition,
  ): Promise<CompilationResult> {
    if (!langDef.isCompiled || !langDef.compileCommand) {
      return {
        success: true,
        stderr: "",
        outputBinaryPath: sourceFilename,
      };
    }

    const cmd = langDef.compileCommand
      .replace("{filename}", sourceFilename)
      .replace("{output}", outputFilename);

    try {
      await execAsync(cmd, { cwd: runDir });
      return {
        success: true,
        stderr: "",
        outputBinaryPath: outputFilename,
      };
    } catch (error) {
      const err = error as { stderr?: string; message?: string };
      return {
        success: false,
        stderr: err.stderr || err.message || "Compilation failed",
        outputBinaryPath: "",
      };
    }
  }
}
