// GENERATED CODE! DO NOT MODIFY BY HAND!

import { platform } from "os";
import { spawn } from "bun";
import { CodexClient } from "./codex-client";

export const codexClient = new CodexClient();

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
  reasoning_effort?: string;
  signal?: AbortSignal;
}

export async function execCodex(
  messages: Message[],
  options: CodexOptions = {},
): Promise<string> {
  let fullMessage = "";
  for await (const event of execCodexStream(messages, options)) {
    if (event.type === "message") {
      fullMessage += event.text;
    }
  }
  return fullMessage;
}

export type CodexStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "message"; text: string }
  | { type: "error"; text: string };

export async function* execCodexStream(
  messages: Message[],
  options: CodexOptions = {},
): AsyncGenerator<CodexStreamEvent, void, unknown> {
  if (!options.model) {
    // Default to a sane model if not provided
    options.model = "gpt-5.1";
  }

  yield* codexClient.chatCompletionStream(messages, {
    model: options.model,
  });
}
