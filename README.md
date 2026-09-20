# OpsPilot — AI Infrastructure Operations Agent

OpsPilot is a small, explainable AI infrastructure-operations assistant built specifically as a Cloudflare Agents assignment.

## Assignment requirements

| Cloudflare requirement | Implementation |
|---|---|
| LLM | Cloudflare Workers AI (`@cf/meta/llama-4-scout-17b-16e-instruct`) |
| Workflow / coordination | `runIncidentDiagnosis` performs a sequential health → error inspection → severity classification workflow |
| User input via chat | React chat UI using `useAgentChat` over the Agents WebSocket protocol |
| Memory / state | `AIChatAgent` persists conversation messages; Agent state persists active service, last incident, and check count in Durable Object SQLite |

## Features

- Stateful chat agent
- Streaming LLM responses
- Server-side tools
- Coordinated multi-step incident diagnosis
- Persistent conversation history
- Persistent operational state
- Simple simulated telemetry so the project works without external monitoring credentials
- Responsive React UI

## Architecture

```text
React Chat UI
      |
      | WebSocket chat
      v
Cloudflare AIChatAgent (Durable Object)
      |
      +--> Workers AI LLM
      |
      +--> Tools
      |     +--> service health
      |     +--> recent errors
      |     +--> incident diagnosis workflow
      |     +--> persistent state
      |
      +--> SQLite-backed conversation/state
```

## Local setup

Requirements: Node.js 18+ and a Cloudflare account with Workers AI enabled.

```bash
npm install
npm run dev
```

Open the local Vite URL printed by the terminal.

## Deploy

Authenticate Wrangler:

```bash
npx wrangler login
```

Then:

```bash
npm run deploy
```

The first deployment creates the Durable Object-backed agent and Workers AI binding from `wrangler.jsonc`.

## Demo prompts

Try:

- `Diagnose the API service and tell me what is wrong.`
- `Check search health and recent errors.`
- `Run an incident diagnosis for payments.`
- `What do you remember about the last incident?`
- `Show me the current agent state.`

## Why the telemetry is simulated

The assignment does not require connecting to a real production monitoring system. Simulated telemetry keeps the demo deterministic, credential-free, and easy to explain. The tool boundaries are designed so the simulated functions can later be replaced with real observability APIs.

## Interview explanation

**LLM:** Workers AI interprets the operator's request and decides which tool is useful.

**Workflow:** `runIncidentDiagnosis` coordinates three simple stages: health check, error inspection, and severity classification. Each stage feeds the next.

**State:** The Durable Object agent persists the conversation and an `OpsState` object containing the active service, last incident, and number of checks.

**Tools:** The model does not directly access internal data. It calls typed server-side tools with Zod schemas. This makes the integration explicit and testable.

**Scalability:** The Agent runtime gives each agent instance durable identity and state. Workers AI executes the model call at the edge, while the tool layer can later call real APIs.

## Important submission note

Only submit this as the Cloudflare optional assignment after you have installed, run, tested, and deployed it yourself. Keep the GitHub repository public if the application requires a public repo, and make sure the README and code match the deployed behavior.

AI-assisted coding is encouraged by the Cloudflare assignment, so retain the prompt history used while developing this project if Cloudflare requests it.
