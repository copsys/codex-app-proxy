import { spawn } from "bun";
import {
  getCodexBinaryPath,
  type Message,
  type CodexStreamEvent,
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
    options: { model: string },
  ): AsyncGenerator<CodexStreamEvent> {
    // Format full prompt
    let fullPrompt = "";
    for (const msg of messages) {
      const roleName = msg.role.toUpperCase();
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      fullPrompt += `[${roleName}]\n${content}\n\n`;
    }
    fullPrompt = (fullPrompt.trim() || "Please help me.") + "\n\n[ASSISTANT]\n";

    const threadParams: ThreadStartParams = {
      model: options.model,
      cwd: process.cwd(),
      experimentalRawEvents: false,
      persistExtendedHistory: false,
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
        sandboxPolicy: {
          type: "readOnly",
          access: { type: "fullAccess" },
        },
        model: options.model,
        effort: "none" as any,
        summary: "none" as any,
      };

      const turnPromise = this.request("turn/start", turnParams);

      let turnDone = false;
      const eventQueue: CodexStreamEvent[] = [];
      let resolveNext: (() => void) | null = null;

      const cleanup = this.onEvent((event) => {
        if (event.type === "notification") {
          const { method, params } = event;

          if (method === "item/agentMessage/delta") {
            const p = params as AgentMessageDeltaNotification;
            eventQueue.push({ type: "message", text: p.delta });
          } else if (
            method === "item/reasoning/textDelta" ||
            method === "item/reasoning/summaryTextDelta"
          ) {
            const p = params as ReasoningTextDeltaNotification;
            eventQueue.push({ type: "reasoning", text: p.delta });
          } else if (method === "turn/completed") {
            turnDone = true;
          } else if (method === "error") {
            const p = params as ErrorNotification;
            const errMsg =
              p.error?.message || (p as any).message || "Unknown error";
            eventQueue.push({ type: "error", text: errMsg });
            turnDone = true;
          }
        } else if (event.type === "agent_message_content_delta") {
          eventQueue.push({ type: "message", text: event.delta });
        } else if (event.type === "reasoning_content_delta") {
          eventQueue.push({ type: "reasoning", text: event.delta });
        } else if (event.type === "task_complete") {
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
