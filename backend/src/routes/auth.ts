import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import {
  authService,
  requireCsrf,
  SESSION_COOKIE_NAME,
} from "../plugins/authentication.js";
import { requestAuditContext } from "../request-context.js";
import { AccountService, type SelfRegistrationInput } from "../services/account-service.js";

interface LoginBody {
  identifier: string;
  password: string;
}

const loginBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["identifier", "password"],
  properties: {
    identifier: { type: "string", minLength: 3, maxLength: 255 },
    password: { type: "string", minLength: 8, maxLength: 256 },
  },
} as const;

export async function authenticationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/auth/registration-organizations",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async () => new AccountService(app.db, app.config).registrationOrganizations(),
  );

  app.post<{ Body: SelfRegistrationInput }>(
    "/auth/register",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "full_name", "organization_id", "contact_phone", "job_title", "password"],
          properties: {
            email: { type: "string", format: "email", maxLength: 255 },
            username: { type: ["string", "null"], minLength: 3, maxLength: 120, pattern: "^[A-Za-z0-9._-]+$" },
            full_name: { type: "string", minLength: 2, maxLength: 255 },
            organization_id: { type: "string", format: "uuid" },
            contact_phone: { type: "string", minLength: 8, maxLength: 50, pattern: "^[0-9+(). -]+$" },
            job_title: { type: "string", minLength: 2, maxLength: 160 },
            employee_id: { type: ["string", "null"], minLength: 3, maxLength: 80 },
            request_note: { type: ["string", "null"], maxLength: 1000 },
            password: { type: "string", minLength: 12, maxLength: 256 },
          },
        },
      },
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const result = await new AccountService(app.db, app.config).register(
        request.body,
        requestAuditContext(request),
      );
      return reply.code(201).send(result);
    },
  );

  app.post<{ Body: LoginBody }>(
    "/auth/login",
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const result = await authService(request).login({
        identifier: request.body.identifier.trim(),
        password: request.body.password,
        ...requestAuditContext(request),
      });
      if (!result) throw new ApiError(401, "INVALID_CREDENTIALS", "Email/username atau kata sandi salah.");

      reply.setCookie(SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        secure: app.config.cookieSecure,
        sameSite: "lax",
        path: "/",
        maxAge: app.config.sessionTtlSeconds,
      });
      return {
        user: result.user,
        csrf_token: result.csrfToken,
        expires_at: result.expiresAt.toISOString(),
      };
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    requireCsrf(request);
    await authService(request).logout(request.auth!, requestAuditContext(request));
    reply.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: app.config.cookieSecure,
      sameSite: "lax",
      path: "/",
    });
    return reply.code(204).send();
  });

  app.post<{ Body: { current_password: string; new_password: string } }>(
    "/me/password",
    {
      schema: {
        body: {
          type: "object", additionalProperties: false,
          required: ["current_password", "new_password"],
          properties: {
            current_password: { type: "string", minLength: 8, maxLength: 256 },
            new_password: { type: "string", minLength: 12, maxLength: 256 },
          },
        },
      },
    },
    async (request) => {
      requireCsrf(request);
      return new AccountService(app.db, app.config).changePassword(
        request.auth!, request.body.current_password, request.body.new_password, requestAuditContext(request),
      );
    },
  );

  app.get<{ Params: { token: string } }>(
    "/auth/invitations/:token",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["token"],
          properties: { token: { type: "string", minLength: 32, maxLength: 200 } },
        },
      },
    },
    async (request) => new AccountService(app.db, app.config).inspectInvitation(request.params.token),
  );

  app.post<{ Params: { token: string }; Body: { password: string } }>(
    "/auth/invitations/:token/accept",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["token"],
          properties: { token: { type: "string", minLength: 32, maxLength: 200 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["password"],
          properties: {
            password: { type: "string", minLength: 12, maxLength: 256 },
          },
        },
      },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request) => new AccountService(app.db, app.config).acceptInvitation(
      request.params.token,
      request.body.password,
      requestAuditContext(request),
    ),
  );
}
