# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

- `npm run compile` — Full build: type-check + lint + bundle with esbuild
- `npm run watch` — Watch mode (esbuild + tsc in parallel)
- `npm run check-types` — TypeScript type-check only (`tsc --noEmit`)
- `npm run lint` — ESLint on `src/`
- `npm test` — Run VS Code extension tests via `@vscode/test-cli`
- `npm run test:coverage` — Run tests with coverage (lcov + text + json-summary)
- `npm run package` — Production build (minified, drops console.log)
- `npm run perf:bench` — Runtime benchmarks
- `npm run perf:profile` — CPU profile dashboard
- `npm run perf:request-tracking` — Request tracking validation

## Architecture Overview

This is a **VS Code extension** (`vscode` engine ^1.95.0) that acts as a **universal API gateway** for all language models available in VS Code (GitHub Copilot, Gemini Code Assist, Ollama, etc.). It exposes them via OpenAI-compatible, Anthropic-compatible, Google Gemini-compatible, and Llama-compatible REST APIs plus WebSocket realtime endpoints.

### Key Files & Roles

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension activation: registers all commands, manages server lifecycle (auto-start, status bar, notifications, URI handler), wires up the webview panel |
| `src/CopilotApiGateway.ts` | **Core (~6600 lines)**: HTTP/HTTPS/WebSocket server, route handling for all API formats, model discovery via `vscode.lm.selectChatModels()`, streaming, auth, rate limiting, IP allowlisting, redaction, stats, audit, Cloudflare tunnel |
| `src/CopilotPanel.ts` | **Webview UI (~3500 lines)**: Sidebar panel + full dashboard + wiki panels. Communicates with extension via `postMessage`. Contains all HTML/CSS/JS inline. |
| `src/McpService.ts` | MCP (Model Context Protocol) client management: connects to stdio/SSE MCP servers, exposes tools via the API |
| `src/anthropicToolPairs.ts` | Helpers for Anthropic-format tool pair handling (tool_use ↔ tool_result matching, flattening, debug info) |
| `src/services/AuditService.ts` | File-based audit logging with JSONL files, daily stats aggregation, retention/pruning |
| `src/services/TelemetryService.ts` | Anonymous extension health telemetry via Application Insights (respects VS Code telemetry level) |
| `src/services/PerfMetrics.ts` | In-memory performance metrics (request durations, webview render times) |
| `src/services/ExtensionHostProfiler.ts` | VS Code extension host CPU profiling |
| `src/services/VSCodeToolProvider.ts` | Bridges VS Code's `vscode.lm.tools` into the MCP tool system |

### API Endpoints Served

- `POST /v1/chat/completions` — OpenAI chat (streaming supported)
- `POST /v1/completions` — OpenAI legacy completions
- `POST /v1/responses` — OpenAI Responses API (2026 spec)
- `POST /v1/messages` — Anthropic Messages API
- `POST /v1beta/models/{model}:generateContent` — Google Gemini
- `POST /llama/v1/chat/completions` — Llama-compatible
- `GET /v1/models` — List available models
- `GET/POST /v1/tools`, `/v1/tools/call` — Tool invocation (MCP + VS Code)
- `GET /v1/mcp/servers` — Connected MCP server status
- `WS /v1/realtime`, `/anthropic/v1/realtime`, etc. — WebSocket realtime endpoints (opt-in)

### Data Flow

1. **Request arrives** → HTTP server in `CopilotApiGateway.handleHttpRequest()`
2. **Middleware chain**: CORS → per-IP connection limit → auth (optional API key) → rate limiting → IP allowlist
3. **Route dispatch**: Matches path + method to handler (chat completion, Anthropic messages, Google, etc.)
4. **Model resolution**: `resolveModel()` maps any model ID to an available VS Code `LanguageModelChat`
5. **VS Code LM call**: `lmModel.sendRequest(messages, options, token)` → streams via `response.stream`
6. **Response format conversion**: Gateway converts VS Code LM response format back to the target API format (OpenAI/Anthropic/Google/Llama)
7. **Audit & stats**: Every request is logged to audit files and contributes to in-memory stats

### Configuration

All settings are under `githubCopilotApi.*` in VS Code settings. Key settings are defined in `package.json`'s `contributes.configuration` including server host/port, auth, rate limiting, MCP servers, TLS, logging, redaction patterns, and tunnel.

### Key Dependencies

- **`ws`** — WebSocket server for realtime endpoints
- **`@modelcontextprotocol/sdk`** — MCP client for external tool servers
- **`cloudflared`** — Cloudflare Quick Tunnel for public internet access
- **`selfsigned`** — Auto-generates self-signed TLS certificates
- **`@vscode/extension-telemetry`** — Application Insights telemetry
- **`esbuild`** — Bundler for the extension (outputs single `dist/extension.js`)
