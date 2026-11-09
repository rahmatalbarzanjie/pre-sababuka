import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireCsrf, requirePermission } from "../plugins/authentication.js";
import { requestAuditContext } from "../request-context.js";
import {
  AdminService,
  type OrganizationInput,
  type RoleAssignmentInput,
  type UserCreateInput,
  type UserUpdateInput,
} from "../services/admin-service.js";

const uuid = { type: "string", format: "uuid" } as const;
const nullableUuid = { anyOf: [uuid, { type: "null" }] } as const;
const pageQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1, default: 1 },
    page_size: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    q: { type: "string", maxLength: 200 },
    sort_by: { type: "string", maxLength: 40 },
    sort_order: { type: "string", enum: ["asc", "desc"] },
  },
} as const;

function service(request: FastifyRequest): AdminService {
  return new AdminService(request.server.db, request.server.config);
}

function mutate(request: FastifyRequest, permission: string): void {
  requireCsrf(request);
  requirePermission(request, permission);
}

interface PageQueryInput {
  page?: number;
  page_size?: number;
  q?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}

function pageQuery(query: PageQueryInput) {
  return { page: query.page ?? 1, pageSize: query.page_size ?? 25, search: query.q, sortBy: query.sort_by, sortOrder: query.sort_order };
}

export async function administrationRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: PageQueryInput & { active?: boolean } }>(
    "/organizations",
    {
      schema: {
        querystring: {
          ...pageQuerySchema,
          properties: {
            ...pageQuerySchema.properties,
            active: { type: "boolean" },
          },
        },
      },
    },
    async (request) => {
      requirePermission(request, "organization.view");
      return service(request).listOrganizations(request.auth!, {
        ...pageQuery(request.query),
        active: request.query.active,
      });
    },
  );

  app.post<{ Body: OrganizationInput }>(
    "/organizations",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["code", "name", "organization_type"],
          properties: {
            code: { type: "string", pattern: "^[A-Z0-9][A-Z0-9._-]*$", maxLength: 64 },
            name: { type: "string", minLength: 2, maxLength: 255 },
            short_name: { type: ["string", "null"], maxLength: 120 },
            organization_type: { type: "string", minLength: 2, maxLength: 40 },
            parent_id: nullableUuid,
          },
        },
      },
    },
    async (request, reply) => {
      mutate(request, "organization.manage");
      const organization = await service(request).createOrganization(
        request.auth!,
        request.body,
        requestAuditContext(request),
      );
      return reply.code(201).send(organization);
    },
  );

  app.get<{ Querystring: PageQueryInput & { organization_id?: string; status?: string } }>(
    "/users",
    {
      schema: {
        querystring: {
          ...pageQuerySchema,
          properties: {
            ...pageQuerySchema.properties,
            organization_id: uuid,
            status: { type: "string", enum: ["invited", "active", "suspended", "locked"] },
          },
        },
      },
    },
    async (request) => {
      requirePermission(request, "user.view");
      return service(request).listUsers(request.auth!, {
        ...pageQuery(request.query),
        organizationId: request.query.organization_id,
        status: request.query.status,
      });
    },
  );

  app.post<{ Body: UserCreateInput }>(
    "/users",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "full_name", "organization_id"],
          properties: {
            email: { type: "string", format: "email", maxLength: 255 },
            username: { type: ["string", "null"], minLength: 3, maxLength: 120 },
            full_name: { type: "string", minLength: 2, maxLength: 255 },
            organization_id: uuid,
          },
        },
      },
    },
    async (request, reply) => {
      mutate(request, "user.create");
      const user = await service(request).createUser(
        request.auth!,
        request.body,
        requestAuditContext(request),
      );
      return reply.code(201).send(user);
    },
  );

  app.patch<{ Params: { user_id: string }; Body: UserUpdateInput }>(
    "/users/:user_id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["user_id"],
          properties: { user_id: uuid },
        },
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            email: { type: "string", format: "email", maxLength: 255 },
            username: { type: ["string", "null"], minLength: 3, maxLength: 120 },
            full_name: { type: "string", minLength: 2, maxLength: 255 },
            contact_phone: { type: ["string", "null"], maxLength: 50, pattern: "^[0-9+(). -]*$" },
            job_title: { type: ["string", "null"], maxLength: 160 },
            employee_id: { type: ["string", "null"], maxLength: 80 },
            status: { type: "string", enum: ["invited", "active", "suspended", "locked"] },
          },
        },
      },
    },
    async (request) => {
      requireCsrf(request);
      if (request.body.status) requirePermission(request, "user.activate");
      if (
        Object.hasOwn(request.body, "email") ||
        Object.hasOwn(request.body, "username") ||
        Object.hasOwn(request.body, "full_name") ||
        Object.hasOwn(request.body, "contact_phone") ||
        Object.hasOwn(request.body, "job_title") ||
        Object.hasOwn(request.body, "employee_id")
      ) {
        requirePermission(request, "user.update");
      }
      return service(request).updateUser(
        request.auth!,
        request.params.user_id,
        request.body,
        requestAuditContext(request),
      );
    },
  );

  app.post<{ Params: { user_id: string }; Body: { notes: string } }>(
    "/users/:user_id/reject-registration",
    {
      schema: {
        params: { type: "object", additionalProperties: false, required: ["user_id"], properties: { user_id: uuid } },
        body: { type: "object", additionalProperties: false, required: ["notes"], properties: { notes: { type: "string", minLength: 5, maxLength: 1000 } } },
      },
    },
    async (request) => {
      requireCsrf(request);
      requirePermission(request, "user.activate");
      return service(request).rejectRegistration(request.auth!, request.params.user_id, request.body.notes, requestAuditContext(request));
    },
  );

  app.delete<{ Params: { user_id: string } }>(
    "/users/:user_id",
    {
      schema: { params: { type: "object", additionalProperties: false, required: ["user_id"], properties: { user_id: uuid } } },
    },
    async (request, reply) => {
      mutate(request, "user.activate");
      await service(request).archiveUser(request.auth!, request.params.user_id, requestAuditContext(request));
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { user_id: string }; Body: RoleAssignmentInput }>(
    "/users/:user_id/approve-registration",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["user_id"],
          properties: { user_id: uuid },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["role_id", "scope_type"],
          properties: {
            role_id: uuid,
            scope_type: { type: "string", enum: ["global", "organization", "self", "published"] },
            organization_id: nullableUuid,
            ends_at: { type: ["string", "null"], format: "date-time" },
            approval_notes: { type: ["string", "null"], maxLength: 1000 },
          },
        },
      },
    },
    async (request) => {
      requireCsrf(request);
      requirePermission(request, "user.activate");
      requirePermission(request, "user.assign_role");
      return service(request).approveRegistration(
        request.auth!,
        request.params.user_id,
        request.body,
        requestAuditContext(request),
      );
    },
  );

  app.post<{ Params: { user_id: string }; Body: RoleAssignmentInput }>(
    "/users/:user_id/role-assignments",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["user_id"],
          properties: { user_id: uuid },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["role_id", "scope_type"],
          properties: {
            role_id: uuid,
            scope_type: { type: "string", enum: ["global", "organization", "self", "published"] },
            organization_id: nullableUuid,
            ends_at: { type: ["string", "null"], format: "date-time" },
          },
        },
      },
    },
    async (request, reply) => {
      mutate(request, "user.assign_role");
      const assignment = await service(request).assignRole(
        request.auth!,
        request.params.user_id,
        request.body,
        requestAuditContext(request),
      );
      return reply.code(201).send(assignment);
    },
  );

  app.get("/roles", async (request) => {
    requirePermission(request, "role.view");
    return service(request).listRoles();
  });

  app.get("/permissions", async (request) => {
    requirePermission(request, "role.view");
    return service(request).listPermissions();
  });

  app.put<{ Params: { role_id: string }; Body: { permission_ids: string[]; reason?: string } }>(
    "/roles/:role_id/permissions",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["role_id"],
          properties: { role_id: uuid },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["permission_ids"],
          properties: {
            permission_ids: { type: "array", uniqueItems: true, maxItems: 500, items: uuid },
            reason: { type: "string", minLength: 5, maxLength: 1000 },
          },
        },
      },
    },
    async (request) => {
      mutate(request, "role.manage");
      return service(request).replaceRolePermissions(
        request.auth!,
        request.params.role_id,
        request.body.permission_ids,
        requestAuditContext(request),
        request.body.reason,
      );
    },
  );

  app.get("/menus", async (request) => {
    requirePermission(request, "menu.manage");
    return service(request).listMenus();
  });

  app.put<{ Params: { role_id: string }; Body: { menu_ids: string[] } }>(
    "/roles/:role_id/menus",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["role_id"],
          properties: { role_id: uuid },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["menu_ids"],
          properties: { menu_ids: { type: "array", uniqueItems: true, maxItems: 200, items: uuid } },
        },
      },
    },
    async (request) => {
      mutate(request, "menu.manage");
      return service(request).replaceRoleMenus(
        request.auth!,
        request.params.role_id,
        request.body.menu_ids,
        requestAuditContext(request),
      );
    },
  );

  app.get<{ Params: { role_id: string } }>(
    "/roles/:role_id/menus",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["role_id"],
          properties: { role_id: uuid },
        },
      },
    },
    async (request) => {
      requirePermission(request, "menu.manage");
      return service(request).getRoleMenus(request.params.role_id);
    },
  );

  app.get("/system/configuration", async (request) => {
    requirePermission(request, "system.configure");
    return service(request).listSystemConfiguration();
  });

  app.get("/system/dashboard", async (request) => {
    requirePermission(request, "system.configure");
    return service(request).getSystemDashboard();
  });

  app.put<{ Params: { key: string }; Body: { value: unknown; description?: string | null } }>(
    "/system/settings/:key",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["key"],
          properties: { key: { type: "string", pattern: "^[a-z][a-z0-9._-]*$", maxLength: 120 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["value"],
          properties: {
            value: {},
            description: { type: ["string", "null"], maxLength: 2000 },
          },
        },
      },
    },
    async (request) => {
      mutate(request, "system.configure");
      return service(request).upsertSetting(
        request.auth!,
        request.params.key,
        request.body.value,
        request.body.description ?? null,
        requestAuditContext(request),
      );
    },
  );

  app.put<{ Params: { code: string }; Body: { is_enabled: boolean; configuration?: Record<string, unknown> } }>(
    "/system/feature-flags/:code",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["code"],
          properties: { code: { type: "string", pattern: "^[a-z][a-z0-9._-]*$", maxLength: 80 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["is_enabled"],
          properties: {
            is_enabled: { type: "boolean" },
            configuration: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    async (request) => {
      mutate(request, "system.feature_manage");
      return service(request).updateFeatureFlag(
        request.auth!,
        request.params.code,
        request.body.is_enabled,
        request.body.configuration ?? {},
        requestAuditContext(request),
      );
    },
  );

}
