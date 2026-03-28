import { spawn } from "bun";
import {
  getCodexBinaryPath,
  type Message,
  type CodexStreamEvent,
  type ParsedToolCall,
  parseToolCalls,
  buildToolInstructions,
} from "./codex";

// Official V2 Types
import type {
  ThreadStartParams,
  TurnStartParams,
  UserInput,
  AgentMessageDeltaNotification,
  ReasoningTextDeltaNotification,
  TurnCompletedNotification,
  ErrorNotification,
  ItemStartedNotification,
  ThreadStartResponse,
} from "../v2";

export class CodexClient {
  private proc: any;
  private reader: any;
  private writer: any;
  private nextId = 1;
  private pendingRequests = new Map<number, (res: any) => void>();
  private eventHandlers = new Set<(event: any) => void>();

  constructor() {}

  async start() {
    const binaryPath = getCodexBinaryPath();
    console.log(`[CodexClient] Starting app-server at ${binaryPath}`);

    this.proc = spawn([binaryPath, "app-server", "--listen", "stdio://"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });

    this.reader = this.proc.stdout.getReader();
    this.writer = this.proc.stdin;

    this.readLoop();

    // Perform handshake
    await this.request("initialize", {
      clientInfo: { name: "CodexProxy", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
  }

  private async readLoop() {
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;

          try {
            const msg = JSON.parse(line);
            if (msg.id !== undefined) {
              const handler = this.pendingRequests.get(msg.id);
              if (handler) {
                handler(msg.result || msg.error);
                this.pendingRequests.delete(msg.id);
              }
            } else if (msg.method) {
              const method = msg.method;
              const params = msg.params;
              for (const handler of this.eventHandlers) {
                handler({ type: "notification", method, params });
              }
            } else if (msg.type) {
              for (const handler of this.eventHandlers) {
                handler(msg);
              }
            }
          } catch (e) {
            console.error(`[CodexClient] Failed to parse message: ${line}`, e);
          }
        }
      }
    } catch (err) {
      console.error("[CodexClient] Read loop error:", err);
    }
  }

  async request(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    const req = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve) => {
      this.pendingRequests.set(id, (res) => {
        resolve(res);
      });
      this.writer.write(JSON.stringify(req) + "\n");
    });
  }

  public onEvent(handler: (event: any) => void) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async stop() {
    this.proc?.kill();
  }

  async *chatCompletionStream(
    messages: Message[],
    options: {
      model: string;
      tools?: any[];
      tool_choice?: any;
      browseros_mode?: boolean;
    },
  ): AsyncGenerator<CodexStreamEvent> {
    const hasTools = options.tools && options.tools.length > 0;

    // --- Extract system messages into baseInstructions ---
    const systemParts: string[] = [];
    const nonSystemMessages: Message[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        systemParts.push(content);
      } else {
        nonSystemMessages.push(msg);
      }
    }

    let baseInstructions = systemParts.join("\n\n") || undefined;

    // --- If tools are provided, inject tool definitions into instructions ---
    if (hasTools) {
      const toolBlock = buildToolInstructions(
        options.tools!,
        options.tool_choice,
      );
      baseInstructions = (baseInstructions || "") + toolBlock;
    }

    if (hasTools && options.browseros_mode) {
      const browserOSToolModeInstructions =
        `\n\n## BrowserOS Tool Execution Mode\n\n` +
        `You are running as a tool-calling planner inside BrowserOS. ` +
        `You can and must control the browser by emitting tool calls. ` +
        `Do not claim you cannot access or control the browser/environment. ` +
        `When a browser action is requested, respond with tool calls only (and brief coordinating text only when necessary). ` +
        `If an action needs multiple steps, emit the next required tool call(s) for the current step.\n`;
      baseInstructions = (baseInstructions || "") + browserOSToolModeInstructions;
    }

    // --- Format conversation messages into prompt ---
    let fullPrompt = "";
    for (const msg of nonSystemMessages) {
      if (msg.role === "tool") {
        // Tool result message from BrowserOS
        const toolCallId = (msg as any).tool_call_id || "unknown";
        const toolName = (msg as any).name || "unknown";
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        fullPrompt += `[TOOL_RESULT] (tool_call_id: ${toolCallId}, name: ${toolName})\n${content}\n\n`;
      } else if (msg.role === "assistant" && (msg as any).tool_calls) {
        // Assistant message that contained tool calls (history from previous turns)
        const toolCalls = (msg as any).tool_calls as any[];
        let assistantContent = "";
        if (msg.content) {
          assistantContent +=
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content);
          assistantContent += "\n";
        }
        for (const tc of toolCalls) {
          if (tc.type === "function" && tc.function) {
            assistantContent += `<tool_call>{"name": "${tc.function.name}", "arguments": ${tc.function.arguments}}</tool_call>\n`;
          }
        }
        fullPrompt += `[ASSISTANT]\n${assistantContent}\n`;
      } else {
        const roleName = msg.role.toUpperCase();
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        fullPrompt += `[${roleName}]\n${content}\n\n`;
      }
    }
    fullPrompt = (fullPrompt.trim() || "Please help me.") + "\n\n[ASSISTANT]\n";

    const threadParams: ThreadStartParams = {
      model: options.model,
      cwd: process.cwd(),
      experimentalRawEvents: false,
      persistExtendedHistory: false,
      ...(baseInstructions ? { baseInstructions } : {}),
    };

    const startRes = (await this.request(
      "thread/start",
      threadParams,
    )) as ThreadStartResponse;
    const threadId =
      startRes.thread?.id || (startRes as any).id || (startRes as any).threadId;

    if (!threadId) {
      throw new Error(
        "[CodexClient] Failed to start thread: " + JSON.stringify(startRes),
      );
    }

    try {
      const input: UserInput[] = [
        {
          type: "text",
          text: fullPrompt,
          text_elements: [],
        },
      ];

      const turnParams: TurnStartParams = {
        threadId: threadId,
        input: input,
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandboxPolicy: hasTools
          ? { type: "readOnly", access: { type: "fullAccess" } }
          : { type: "dangerFullAccess" },
        model: options.model,
        effort: "none" as any,
        summary: "none" as any,
      };

      const turnPromise = this.request("turn/start", turnParams);

      let turnDone = false;
      const eventQueue: CodexStreamEvent[] = [];
      let resolveNext: (() => void) | null = null;
      let accumulatedText = "";

      const cleanup = this.onEvent((event) => {
        if (event.type === "notification") {
          const { method, params } = event;

          if (method === "item/agentMessage/delta") {
            const p = params as AgentMessageDeltaNotification;
            accumulatedText += p.delta;
            if (!hasTools) {
              // When no tools, stream text directly
              eventQueue.push({ type: "message", text: p.delta });
            }
            // When tools present, we buffer and parse at the end
          } else if (
            method === "item/reasoning/textDelta" ||
            method === "item/reasoning/summaryTextDelta"
          ) {
            const p = params as ReasoningTextDeltaNotification;
            eventQueue.push({ type: "reasoning", text: p.delta });
          } else if (method === "turn/completed") {
            // If tools are present, check for tool calls in accumulated text
            if (hasTools && accumulatedText) {
              const toolCalls = parseToolCalls(accumulatedText);
              if (toolCalls.length > 0) {
                // Strip tool_call tags from text, emit remaining as content
                const textWithoutToolCalls = accumulatedText
                  .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
                  .trim();
                if (textWithoutToolCalls) {
                  eventQueue.push({
                    type: "message",
                    text: textWithoutToolCalls,
                  });
                }
                eventQueue.push({ type: "tool_calls", calls: toolCalls });
              } else {
                // No tool calls found, emit as plain message
                eventQueue.push({ type: "message", text: accumulatedText });
              }
            }
            turnDone = true;
          } else if (method === "error") {
            const p = params as ErrorNotification;
            const errMsg =
              p.error?.message || (p as any).message || "Unknown error";
            eventQueue.push({ type: "error", text: errMsg });
            turnDone = true;
          } else if (method === "commandExecution/requestApproval") {
            // Auto-approve command executions for agentic behavior
            const approvalId = params?.approvalId;
            if (approvalId) {
              console.log(
                `[CodexClient] Auto-approving command execution: ${params?.command || "unknown"}`,
              );
              this.request("commandExecution/sendApproval", {
                approvalId,
                decision: "accept",
              }).catch(() => {});
            }
          } else if (method === "fileChange/requestApproval") {
            // Auto-approve file changes for agentic behavior
            const approvalId = params?.approvalId;
            if (approvalId) {
              console.log(`[CodexClient] Auto-approving file change`);
              this.request("fileChange/sendApproval", {
                approvalId,
                decision: "accept",
              }).catch(() => {});
            }
          } else if (method === "commandExecution/outputDelta") {
            // Surface command output as message text
            if (params?.delta) {
              accumulatedText += params.delta;
              if (!hasTools) {
                eventQueue.push({ type: "message", text: params.delta });
              }
            }
          }
        } else if (event.type === "agent_message_content_delta") {
          accumulatedText += event.delta;
          if (!hasTools) {
            eventQueue.push({ type: "message", text: event.delta });
          }
        } else if (event.type === "reasoning_content_delta") {
          eventQueue.push({ type: "reasoning", text: event.delta });
        } else if (event.type === "task_complete") {
          if (hasTools && accumulatedText) {
            const toolCalls = parseToolCalls(accumulatedText);
            if (toolCalls.length > 0) {
              const textWithoutToolCalls = accumulatedText
                .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
                .trim();
              if (textWithoutToolCalls) {
                eventQueue.push({
                  type: "message",
                  text: textWithoutToolCalls,
                });
              }
              eventQueue.push({ type: "tool_calls", calls: toolCalls });
            } else {
              eventQueue.push({ type: "message", text: accumulatedText });
            }
          }
          turnDone = true;
        }

        if (resolveNext) resolveNext();
      });

      while (!turnDone || eventQueue.length > 0) {
        if (eventQueue.length === 0 && !turnDone) {
          await new Promise<void>((r) => (resolveNext = r));
          resolveNext = null;
        }
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        }
      }

      cleanup();
      await turnPromise.catch(() => {});
    } finally {
      await this.request("thread/archive", { threadId }).catch(() => {});
    }
  }
}
