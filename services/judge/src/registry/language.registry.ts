export interface LanguageDefinition {
  name: string;
  extension: string;
  isCompiled: boolean;
  compileCommand?: string;
  runCommand: string;
  defaultTimeLimitMs: number;
  defaultMemoryLimitMb: number;
}

export class LanguageRegistry {
  private static languages: Record<string, LanguageDefinition> = {
    cpp: {
      name: "cpp",
      extension: "cpp",
      isCompiled: true,
      compileCommand: "g++ -O3 -std=c++17 {filename} -o {output}",
      runCommand: "{output}",
      defaultTimeLimitMs: 2000,
      defaultMemoryLimitMb: 256,
    },
    javascript: {
      name: "javascript",
      extension: "js",
      isCompiled: false,
      runCommand: "node {filename}",
      defaultTimeLimitMs: 2000,
      defaultMemoryLimitMb: 256,
    },
    python: {
      name: "python",
      extension: "py",
      isCompiled: false,
      runCommand: "python3 {filename}",
      defaultTimeLimitMs: 3000,
      defaultMemoryLimitMb: 256,
    },
  };

  public static get(lang: string): LanguageDefinition | null {
    return this.languages[lang.toLowerCase()] || null;
  }

  public static isSupported(lang: string): boolean {
    return !!this.languages[lang.toLowerCase()];
  }
}
