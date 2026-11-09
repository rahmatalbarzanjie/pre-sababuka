import type { FastifyInstance } from "fastify";
import { requireCsrf, requirePermission } from "../plugins/authentication.js";
import { requestAuditContext } from "../request-context.js";
import { ConsolidationService, type ConflictStatus } from "../services/consolidation-service.js";

const uuid = { type: "string", format: "uuid" } as const;

export async function consolidationRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: ConflictStatus } }>("/consolidation/conflicts", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: { status: { type: "string", enum: ["open", "resolved", "all"] } } } },
  }, async (request) => {
    requirePermission(request, "consolidation.view");
    return new ConsolidationService(app.db).list(request.auth!, request.query.status ?? "open");
  });

  app.post<{ Body: { chosen_observation_id: string; note: string } }>("/consolidation/decisions", {
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["chosen_observation_id", "note"],
        properties: { chosen_observation_id: uuid, note: { type: "string", minLength: 10, maxLength: 2000 } },
      },
    },
  }, async (request) => {
    requireCsrf(request);
    requirePermission(request, "consolidation.resolve");
    return new ConsolidationService(app.db).decide(request.auth!, request.body, requestAuditContext(request));
  });
}
