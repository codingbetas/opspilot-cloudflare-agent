import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  generateText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";

type ServiceName = "api" | "payments" | "auth" | "search";

type ServiceHealth = {
  service: ServiceName;
  status: "healthy" | "degraded";
  latencyMs: number;
  errorRate: number;
};

type RecentError = {
  service: ServiceName;
  time: string;
  statusCode: number;
  message: string;
};

type OpsState = {
  activeService: ServiceName;
  checksRun: number;
  lastIncident?: {
    service: ServiceName;
    severity: "low" | "medium" | "high" | "critical";
    diagnosis: string;
  };
};

const SERVICE_HEALTH: Record<ServiceName, ServiceHealth> = {
  api: {
    service: "api",
    status: "degraded",
    latencyMs: 840,
    errorRate: 4.8,
  },

  payments: {
    service: "payments",
    status: "healthy",
    latencyMs: 180,
    errorRate: 0.3,
  },

  auth: {
    service: "auth",
    status: "healthy",
    latencyMs: 120,
    errorRate: 0.2,
  },

  search: {
    service: "search",
    status: "degraded",
    latencyMs: 610,
    errorRate: 2.1,
  },
};

const RECENT_ERRORS: RecentError[] = [
  {
    service: "api",
    time: "2 min ago",
    statusCode: 502,
    message: "Inventory service returned an upstream 502",
  },
  {
    service: "api",
    time: "4 min ago",
    statusCode: 504,
    message: "Catalog request exceeded 800ms timeout",
  },
  {
    service: "api",
    time: "6 min ago",
    statusCode: 503,
    message: "Database connection pool reached 82% utilization",
  },
  {
    service: "search",
    time: "3 min ago",
    statusCode: 500,
    message: "Search shard latency exceeded threshold",
  },
  {
    service: "search",
    time: "8 min ago",
    statusCode: 503,
    message: "Search indexing queue is delayed",
  },
];

function getHealth(service: ServiceName): ServiceHealth {
  return SERVICE_HEALTH[service];
}

function getErrors(service: ServiceName): RecentError[] {
  return RECENT_ERRORS.filter((error) => error.service === service);
}

function classifySeverity(
  health: ServiceHealth,
): "low" | "medium" | "high" | "critical" {
  if (health.errorRate >= 5 || health.latencyMs >= 1000) {
    return "critical";
  }

  if (health.errorRate >= 3 || health.latencyMs >= 700) {
    return "high";
  }

  if (health.errorRate >= 1 || health.latencyMs >= 500) {
    return "medium";
  }

  return "low";
}

export class OpsPilotAgent extends AIChatAgent<Env, OpsState> {
  initialState: OpsState = {
    activeService: "api",
    checksRun: 0,
  };

  async onChatMessage() {
    const workersai = createWorkersAI({
      binding: this.env.AI,
    });

    const result = await generateText({
      model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),

      system: `
You are OpsPilot, an AI infrastructure operations assistant.

Your job is to investigate simulated infrastructure incidents.

IMPORTANT RULES:

1. When the user asks you to diagnose, investigate, or troubleshoot a service, use the available diagnostic tools.
2. Never invent telemetry.
3. Treat tool results as the source of truth.
4. Do not mention internal tool names in your final response.
5. Do not imitate function-call syntax.
6. After investigating, explain the diagnosis clearly.
7. Keep the final response concise and operational.

Available services:
- api
- payments
- auth
- search

For an incident investigation:

1. Identify the affected service.
2. Check service health.
3. Inspect recent errors.
4. Classify incident severity.
5. Explain the likely cause using only returned evidence.
6. Recommend practical next actions.

If the user asks about your current state, checks performed, number of checks, last incident, active service, or previous investigation results, ALWAYS use get_agent_state first.

Do NOT call get_service_health, inspect_recent_errors, or classify_incident merely to answer a state/history question.

For "How many service health checks have you performed?", call ONLY get_agent_state and report the checksRun value.

State/history questions must be answered from persistent agent state. Do not perform new infrastructure checks unless the user explicitly asks you to investigate, diagnose, inspect, troubleshoot, or check a service.

If the user asks a normal conversational question that does not require infrastructure investigation, answer normally without unnecessary tool calls.

Remember:
The telemetry is simulated demonstration data. Never claim it represents a real production system.
`,

      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
      }),

      tools: {
        get_service_health: tool({
          description:
            "Get current health telemetry for one infrastructure service, including status, latency, and error rate.",

          inputSchema: z.object({
            service: z
              .enum(["api", "payments", "auth", "search"])
              .describe("The service to inspect"),
          }),

          execute: async ({ service }) => {
            const health = getHealth(service);

            this.setState({
              ...this.state,
              activeService: service,
              checksRun: this.state.checksRun + 1,
            });

            return health;
          },
        }),

        inspect_recent_errors: tool({
          description:
            "Inspect recent simulated infrastructure errors for a service.",

          inputSchema: z.object({
            service: z
              .enum(["api", "payments", "auth", "search"])
              .describe("The service whose errors should be inspected"),
          }),

          execute: async ({ service }) => {
            return {
              service,
              errors: getErrors(service),
            };
          },
        }),

        classify_incident: tool({
          description:
            "Classify the severity of a service incident using its current health telemetry.",

          inputSchema: z.object({
            service: z
              .enum(["api", "payments", "auth", "search"])
              .describe("The affected service"),
          }),

          execute: async ({ service }) => {
            const health = getHealth(service);
            const severity = classifySeverity(health);

            const diagnosis =
              health.status === "degraded"
                ? `${service} is experiencing degraded performance with ${health.latencyMs}ms latency and a ${health.errorRate}% error rate.`
                : `${service} is currently healthy.`;

            this.setState({
              ...this.state,
              activeService: service,
              lastIncident: {
                service,
                severity,
                diagnosis,
              },
            });

            return {
              service,
              severity,
              diagnosis,
            };
          },
        }),

        get_agent_state: tool({
          description:
            "Return OpsPilot's persistent state from the current Durable Object agent instance.",

          inputSchema: z.object({}),

          execute: async () => {
            return this.state;
          },
        }),
      },

      stopWhen: stepCountIs(6),
    });

    return new Response(result.text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", {
        status: 404,
      })
    );
  },
} satisfies ExportedHandler<Env>;
