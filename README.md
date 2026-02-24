# Codex Local Proxy

A high-performance, lightweight HTTP proxy powered by Bun that allows you to use your locally installed Codex models from any IDE, Editor, or Tool that supports standard OpenAI programmatic endpoints (like `/v1/chat/completions`).

## Why this Proxy?

Unlike basic bridges that spawn a new process for every request, this proxy maintains a **persistent connection** to the Codex engine. This results in:

- **Zero Startup Overhead**: The second request is as fast as the first.
- **True Token-by-Token Streaming**: Real-time response delivery via the official V2 protocol.
- **Minimal Latency**: Typical first-token latency of ~1.5s vs ~5s for legacy methods.

## Requirements

- **[Bun](https://bun.sh)**: The fast JavaScript runtime (required to run the proxy).
- **[Codex Desktop/Mac App](https://codex.app)**: Must be installed and running on your machine (macOS/Windows).
- **[Codex CLI](https://github.com/openai/codex-cli)**: Required for **Linux** users. The `codex` binary must be in your `PATH`.
- **Operating System**: macOS, Windows, or Linux.

## Features

- **Standard API Compatibility:** Acts as a drop-in replacement for OpenAI API endpoints.
- **High-Performance Streaming:** Native support for `stream: true` using Server-Sent Events (SSE).
- **V2 Protocol Integration:** Uses the latest `app-server` JSON-RPC protocol for deep engine integration.
- **Robust Error Handling:** Correctly passes through engine-level notifications like usage limits and reasoning deltas.
- **Model Discovery**: Automatically discovers your available models whether you're running Windows or macOS.

## Supported Parameters

The proxy supports the following OpenAI-compatible parameters in the `/v1/chat/completions` request body:

- **`model`** (string): The slug of the Codex model to use (e.g., `gpt-5.1`, `gpt-5.3-codex`). Defaults to the first available model.
- **`messages`** (array): The standard array of message objects with `role` and `content`.
- **`stream`** (boolean): Whether to stream the response using Server-Sent Events.
- **`temperature`** (number): Controls randomness (passed to the engine).
- **`max_tokens`** (number): Limits the length of the generated response.
- **`reasoning_effort`** (string): For models with reasoning capabilities (e.g., `low`, `medium`, `high`).

## Quick Start

1. Install dependencies:
   ```bash
   bun install
   ```
2. Start the proxy:
   ```bash
   bun start
   ```

By default, the proxy server listens on `http://localhost:8080`.

## Testing the Proxy

You can test the streaming functionality instantaneously from your terminal:

```bash
curl -N -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.1",
    "messages": [
      {"role": "user", "content": "Write a one-line poem about speed."}
    ],
    "stream": true
  }'
```

## Configuration

- **Port**: Set via `PORT` environment variable (defaults to 8080).
- **Models**: The proxy automatically queries your local Codex installation for available model slugs.

## Architecture

This project uses a typed `CodexClient` that manages a persistent `codex app-server` background process. Communication happens over a high-speed JSON-RPC channel on `stdio`, ensuring that the model state remains warm and ready for immediate inference.

## License

This project is licensed under the [MIT License](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get involved.
