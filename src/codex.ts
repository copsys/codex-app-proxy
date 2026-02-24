import { platform } from "os";
import { spawn } from "bun";

export function getCodexBinaryPath(): string {
  if (process.env.CODEX_BIN) {
    return process.env.CODEX_BIN;
  }

  const osType = platform();
  if (osType === "darwin") {
    return "/Applications/Codex.app/Contents/Resources/codex";
  } else if (osType === "win32") {
    // Check local app data or program files for the binary
    const localAppData =
      process.env.LOCALAPPDATA || "C:\\Users\\Default\\AppData\\Local";
    return `${localAppData}\\Programs\\Codex\\codex.exe`;
  } else {
    // Linux or other fallback, assuming it's in the PATH
    return "codex";
  }
}

export interface Message {
  role: string;
  content: string | any;
}

export interface CodexOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export async function execCodex(
  messages: Message[],
  options: CodexOptions = {},
): Promise<string> {
  const binaryPath = getCodexBinaryPath();
  const model = options.model;

  if (!model) {
    throw new Error("[Proxy] Model must be provided to execCodex");
  }

  // Format the entire conversation history into a single prompt for the CLI
  let prompt = "";
  for (const msg of messages) {
    const roleName = msg.role.toUpperCase();
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    prompt += `[${roleName}]\n${content}\n\n`;
  }
  prompt = prompt.trim();
  if (!prompt) {
    prompt = "Please help me.";
  }

  // Provide the prompt safely to the non-interactive CLI.
  // We use --json to get structured output back so we can parse it.
  const args = [
    binaryPath,
    "exec",
    "--skip-git-repo-check",
    "--json",
    "-m",
    model,
  ];

  // Map advanced options to codex config overrides if provided
  if (options.temperature !== undefined) {
    args.push("-c", `temperature=${options.temperature}`);
  }
  if (options.max_tokens !== undefined) {
    args.push("-c", `max_tokens=${options.max_tokens}`);
  }

  args.push(prompt);

  console.log(
    `[Proxy] Executing codex with ${messages.length} messages, model: ${model}`,
  );

  const proc = spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error(
      `[Proxy] codex exec failed with code ${exitCode}:\n${stderrText}`,
    );
    throw new Error(`codex exec failed: ${stderrText || "Unknown error"}`);
  }

  return stdoutText;
}

/**
 * Parses the RAW JSONL output returned by `codex exec --json` to extract just the AI's final text message.
 */
export function extractMessageFromJSONL(jsonl: string): string {
  const lines = jsonl.split("\n").filter(Boolean);
  let finalMessage = "No output found.";

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      // We are looking for the final completed text from the agent
      if (
        parsed.type === "item.completed" &&
        parsed.item?.type === "agent_message"
      ) {
        finalMessage = parsed.item.text || "";
      }
    } catch (e) {
      // Ignore parsing errors for non-JSON lines
    }
  }

  return finalMessage;
}
