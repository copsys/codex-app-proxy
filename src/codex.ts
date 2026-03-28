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
  tools?: any[];
  tool_choice?: any;
  browseros_mode?: boolean;
}

export interface ParsedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
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
  | { type: "error"; text: string }
  | { type: "tool_calls"; calls: ParsedToolCall[] };

/**
 * Parse <tool_call>...</tool_call> blocks from model output text.
 * Returns parsed tool calls, or empty array if none found.
 */
export function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const regex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match;
  let callIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      calls.push({
        id: `call_${Date.now()}_${callIndex++}`,
        type: "function",
        function: {
          name: parsed.name || parsed.function?.name || "",
          arguments:
            typeof parsed.arguments === "string"
              ? parsed.arguments
              : JSON.stringify(parsed.arguments ?? parsed.parameters ?? {}),
        },
      });
    } catch {
      // Skip malformed tool calls
    }
  }
  return calls;
}

/**
 * Build a tool-use instruction block from an OpenAI-format tools array.
 * Injected into the model's system instructions so it knows which tools
 * are available and the expected output format.
 */
export function buildToolInstructions(tools: any[], tool_choice?: any): string {
  let block = `\n\n## Available Tools\n\nYou have access to the following tools to perform actions. You MUST use these tools to fulfill the user's request. Do NOT describe steps or give instructions — instead, call the appropriate tool.\n\nTo call a tool, output one or more tool calls in this exact format (you may output multiple for parallel execution):\n<tool_call>{"name": "tool_name", "arguments": {"param": "value"}}</tool_call>\n\nIMPORTANT RULES:\n- ALWAYS use tool calls to act. NEVER respond with step-by-step instructions when a tool can do the job.\n- You can call multiple tools in a single response.\n- After a tool call, wait for the result before proceeding.\n- If the user asks you to navigate somewhere, use the navigate tool. If they ask you to click, use the click tool. Etc.\n\nHere are the tools:\n\n`;

  for (const tool of tools) {
    if (tool.type === "function" && tool.function) {
      const fn = tool.function;
      block += `### ${fn.name}\n`;
      if (fn.description) block += `${fn.description}\n`;
      if (fn.parameters) {
        block += `Parameters: ${JSON.stringify(fn.parameters)}\n`;
      }
      block += `\n`;
    }
  }

  if (tool_choice && tool_choice !== "auto") {
    if (typeof tool_choice === "object" && tool_choice.function?.name) {
      block += `\nYou MUST use the tool "${tool_choice.function.name}" in your response.\n`;
    } else if (tool_choice === "required") {
      block += `\nYou MUST use at least one tool in your response.\n`;
    }
  }

  return block;
}

export async function* execCodexStream(
  messages: Message[],
  options: CodexOptions = {},
): AsyncGenerator<CodexStreamEvent, void, unknown> {
  if (!options.model) {
    options.model = "gpt-5.1";
  }

  yield* codexClient.chatCompletionStream(messages, {
    model: options.model,
    tools: options.tools,
    tool_choice: options.tool_choice,
    browseros_mode: options.browseros_mode,
  });
}
