# Contributing to Codex Local Proxy

Thank you for your interest in improving the Codex Local Proxy! We welcome contributions from the community.

## How to Contribute

1. **Bug Reports & Feature Requests**: Open an issue describing the bug or the feature you'd like to see.
2. **Pull Requests**:
   - Fork the repository.
   - Create a new branch for your changes.
   - Ensure your code follows the existing style (TypeScript, Bun).
   - Submit a pull request with a clear description of your changes and why they are needed.

## Development Setup

The project uses [Bun](https://bun.sh) for development and runtime.

```bash
# Install dependencies
bun install

# Run in development mode (with watch)
bun run dev

# Run tests (if applicable)
bun test
```

## Protocol Details

The proxy communicates with the Codex engine using a persistent JSON-RPC session over stdio. If you're modifying the protocol logic, please refer to the consolidated types in `v2/index.ts`.

## Code of Conduct

Please be respectful and professional in all interactions within this project.
