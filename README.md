# Codex Local Proxy

A lightweight, seamless HTTP proxy powered by Bun that allows you to use your locally installed Codex models from any IDE, Editor, or Tool that supports standard OpenAI programmatic endpoints (like `/v1/chat/completions`).

It securely and invisibly leverages your current Codex cache and desktop app installation.

## Use Cases

Instead of relying on remote services that enforce tight rate limiting, quota restrictions, or challenging cloudflare protections, you can host your own bridge directly referencing your installed models.

- **Any AI IDE**: Drop `http://localhost:8080/v1` as the base endpoint into Cursor, VS Code, or JetBrains AI assistants.
- **Local Scripts**: Write scripts using standard OpenAI libraries (Python or Node) that talk transparently to your local premium agentic coding models like `gpt-5.3-codex`.
- **Cross-Platform**: The proxy seamlessly discovers your available models whether you're running Windows or macOS.

## Quick Start

1. Install dependencies:
   ```bash
   bun install
   ```
2. Start the proxy:
   ```bash
   bun start
   ```

By default, the proxy server listens on `http://localhost:8080`. You can test it instantaneously from your terminal:

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.3-codex",
    "messages": [
      {"role": "user", "content": "Hello! What can you do?"}
    ]
  }'
```
