import type { QueryResultRow } from "../database.js";

export interface QueryExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<unknown>;
}

export interface AuditContext {
  actorId: string | null;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  // Diisi bila Developer bertindak sebagai peran/OPD lain; actorId tetap akun Developer asli.
  actingAs?: { role_code: string; organization_id: string | null } | undefined;
}

export interface AuditEvent extends AuditContext {
  eventType: string;
  entityType: string;
  entityId: string | null;
  organizationId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(executor: QueryExecutor, event: AuditEvent): Promise<void> {
  await executor.query(
    `INSERT INTO sababuka.audit_events
       (actor_id, organization_id, event_type, entity_type, entity_id,
        before_data, after_data, metadata, request_id, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10::inet, $11)`,
    [
      event.actorId,
      event.organizationId ?? null,
      event.eventType,
      event.entityType,
      event.entityId,
      event.beforeData ? JSON.stringify(event.beforeData) : null,
      event.afterData ? JSON.stringify(event.afterData) : null,
      JSON.stringify(event.actingAs ? { ...(event.metadata ?? {}), acting_as: event.actingAs } : (event.metadata ?? {})),
      event.requestId,
      event.ipAddress,
      event.userAgent,
    ],
  );
}
