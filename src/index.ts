// GENERATED CODE! DO NOT MODIFY BY HAND!

import { getAvailableModels } from "./models";
import { execCodex, execCodexStream, codexClient } from "./codex";

const PORT = process.env.PORT || 8080;

// Start the persistent Codex app-server
console.log("[Proxy] Starting Codex persistent client...");
await codexClient.start().catch((err) => {
  console.error(
    "[Proxy] Critical: Failed to start Codex persistent client:",
    err,
  );
  process.exit(1);
});

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    // 1. Models endpoint (helps clients know what models are available)
    if (req.method === "GET" && url.pathname.endsWith("/v1/models")) {
      const availableModels = await getAvailableModels();

      const responsePayload = {
        object: "list",
        data: availableModels.map((model) => ({
          id: model.slug,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "codex",
        })),
      };

      return new Response(JSON.stringify(responsePayload), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Chat Completions endpoint
    if (
      req.method === "POST" &&
      url.pathname.endsWith("/v1/chat/completions")
    ) {
      try {
        const body = (await req.json()) as any;
        let model = body.model;
        if (!model) {
          const models = await getAvailableModels();
          model = models[0]?.slug || "gpt-5.3-codex";
        }
        const messages = body.messages || [];
        const temperature = body.temperature;
        const max_tokens = body.max_tokens;
        const reasoning_effort = body.reasoning_effort;

        const stream = body.stream === true;

        console.log(`[Proxy] Received POST /v1/chat/completions`);
        console.log(`[Proxy] Request body keys:`, Object.keys(body));
        if (body.messages) {
          console.log(`[Proxy] Messages count: ${body.messages.length}`);
        }

        if (stream) {
          const responseId = `chatcmpl-${Date.now()}`;
          const createdTime = Math.floor(Date.now() / 1000);

          const streamResponse = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              try {
                let chunkCount = 0;
                let firstChunkTime = 0;
                for await (const event of execCodexStream(messages, {
                  model,
                  temperature,
                  max_tokens,
                  reasoning_effort,
                  signal: req.signal,
                })) {
                  if (req.signal.aborted) break;

                  if (chunkCount === 0) {
                    firstChunkTime = Date.now();
                    console.log(
                      `[Proxy] First stream chunk emitted after ${firstChunkTime - createdTime * 1000}ms`,
                    );
                  }
                  chunkCount++;

                  try {
                    if (event.type === "reasoning") {
                      const payload = {
                        id: responseId,
                        object: "chat.completion.chunk",
                        created: createdTime,
                        model: model,
                        choices: [
                          {
                            index: 0,
                            delta: { reasoning_content: event.text },
                            finish_reason: null,
                          },
                        ],
                      };
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                      );
                    } else if (event.type === "message") {
                      const payload = {
                        id: responseId,
                        object: "chat.completion.chunk",
                        created: createdTime,
                        model: model,
                        choices: [
                          {
                            index: 0,
                            delta: { content: event.text },
                            finish_reason: null,
                          },
                        ],
                      };
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                      );
                    } else if (event.type === "error") {
                      const payload = {
                        id: responseId,
                        object: "chat.completion.chunk",
                        created: createdTime,
                        model: model,
                        choices: [
                          {
                            index: 0,
                            delta: { content: `\n\n[Error] ${event.text}` },
                            finish_reason: "stop",
                          },
                        ],
                      };
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                      );
                    }
                  } catch (e) {
                    // Client disconnected or stream closed
                    console.log(`[Proxy] Client disconnected during stream`);
                    break;
                  }
                }

                console.log(
                  `[Proxy] Finished streaming ${chunkCount} chunks. Elapsed: ${Date.now() - createdTime * 1000}ms`,
                );

                if (!req.signal.aborted) {
                  // Final stream end boundary
                  const streamEndPayload = {
                    id: responseId,
                    object: "chat.completion.chunk",
                    created: createdTime,
                    model: model,
                    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                  };
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify(streamEndPayload)}\n\n`,
                    ),
                  );
                  controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                }
              } catch (err) {
                console.error("[Proxy] Stream Error:", err);
              } finally {
                try {
                  controller.close();
                } catch (e) {}
              }
            },
          });

          return new Response(streamResponse, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        // --- NON-STREAMING ---
        // Consume the stream internally so we don't trigger the 40s timeout lock
        console.log(
          `[Proxy] Executing codex internally via stream buffer for non-streaming request...`,
        );
        let finalMessage = "";

        try {
          for await (const event of execCodexStream(messages, {
            model,
            temperature,
            max_tokens,
            reasoning_effort,
            signal: req.signal,
          })) {
            if (req.signal.aborted) break;
            if (event.type === "message") {
              finalMessage += event.text;
            } else if (event.type === "error") {
              finalMessage = `[Error] ${event.text}`;
              break;
            }
          }
        } catch (err) {
          console.error("[Proxy] Internal Stream Error:", err);
          finalMessage = "Internal Server Error during execution.";
        }

        if (!finalMessage) {
          finalMessage = "No response received.";
        }

        const responseId = `chatcmpl-${Date.now()}`;
        const createdTime = Math.floor(Date.now() / 1000);

        // Format an OpenAI-like response object
        const openAiResponse = {
          id: responseId,
          object: "chat.completion",
          created: createdTime,
          model: model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: finalMessage,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        };

        return new Response(JSON.stringify(openAiResponse), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        console.error("[Proxy] Error handling request:", err);
        return new Response(
          JSON.stringify({
            error: { message: err.message || "Internal Server Error" },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Default 404
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
});

console.log(`Codex Local Proxy listening on http://localhost:${PORT}`);
