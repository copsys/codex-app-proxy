import { getAvailableModels } from "./models";
import { execCodex, extractMessageFromJSONL } from "./codex";

const PORT = process.env.PORT || 8080;

Bun.serve({
  port: PORT,
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
        const model = body.model || "gpt-5.3-codex";
        const messages = body.messages || [];

        // Simple approach: Extract the last user message to pass as the prompt
        let prompt = "Please help me.";
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          prompt =
            typeof lastMessage.content === "string"
              ? lastMessage.content
              : JSON.stringify(lastMessage.content);
        }

        // Spawn Codex CLI and extract JSONL message internally
        const stdoutText = await execCodex(prompt, model);
        const finalMessage = extractMessageFromJSONL(stdoutText);

        // Format an OpenAI-like response object
        const openAiResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: finalMessage || "No response received.",
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
