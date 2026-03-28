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
  let block =
    `\n\n## Available Tools\n\n` +
    `You are an agentic planner operating through external tools. ` +
    `When tools are available, your next action MUST be emitted as tool calls, not prose refusals.\n\n` +
    `Tool call output format (required):\n` +
    `<tool_call>{"name": "tool_name", "arguments": {"param": "value"}}</tool_call>\n\n` +
    `IMPORTANT RULES:\n` +
    `- If a user request is actionable with provided tools, emit one or more <tool_call> blocks.\n` +
    `- Do not say you cannot access the browser/environment when browser tools are provided.\n` +
    `- Keep normal text minimal. Prefer tool-call-only responses for action steps.\n` +
    `- After tool results are returned, emit the next tool call(s) needed to continue.\n` +
    `- For commerce tasks, adding an item to cart is allowed; do not attempt checkout/payment unless user explicitly requests it.\n\n` +
    `Here are the tools:\n\n`;

  for (const tool of tools) {
    if (tool.type === "function" && tool.function) {
      const fn = tool.function;
      block += `### ${fn.name}\n`;
      if (fn.description) block += `${fn.description}\n`;
      if (fn.parameters) {
        block += `Parameters: ${JSON.stringify(fn.parameters)}\n`;
      }
      block += `\n`;
    } else if (tool?.name) {
      // Support alternate tool schemas used by some providers/agents.
      block += `### ${tool.name}\n`;
      if (tool.description) block += `${tool.description}\n`;
      if (tool.input_schema) {
        block += `Parameters: ${JSON.stringify(tool.input_schema)}\n`;
      } else if (tool.parameters) {
        block += `Parameters: ${JSON.stringify(tool.parameters)}\n`;
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
