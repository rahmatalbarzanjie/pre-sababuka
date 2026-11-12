import type { FastifyRequest } from "fastify";
import type { AuditContext } from "./services/audit-service.js";

export function requestAuditContext(request: FastifyRequest): AuditContext {
  const rawUserAgent = request.headers["user-agent"];
  return {
    actorId: request.auth?.user.id ?? null,
    requestId: request.id,
    ipAddress: request.ip || null,
    userAgent: typeof rawUserAgent === "string" ? rawUserAgent.slice(0, 2000) : null,
    actingAs: request.auth?.user.simulation?.active
      ? { role_code: request.auth.user.simulation.role_code, organization_id: request.auth.user.simulation.organization_id }
      : undefined,
  };
}
