import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { Database } from "./database.js";
import { ApiError } from "./errors.js";
import { authenticateRequest } from "./plugins/authentication.js";
import { authenticationRoutes } from "./routes/auth.js";
import { administrationRoutes } from "./routes/admin.js";
import { healthRoutes } from "./routes/health.js";
import { currentUserRoutes } from "./routes/me.js";
import { governanceRoutes } from "./routes/governance.js";
import { submissionRoutes } from "./routes/submissions.js";
import { executiveRoutes } from "./routes/executive.js";
import { publicationRoutes } from "./routes/publications.js";
import { assistantRoutes } from "./routes/assistant.js";
import { monitoringRoutes } from "./routes/monitoring.js";
import { operationRoutes } from "./routes/operations.js";
import { connectorRoutes } from "./routes/connectors.js";
import { consolidationRoutes } from "./routes/consolidation.js";
import { opdProfileRoutes } from "./routes/opd-profiles.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger === false ? false : { level: options.config.logLevel },
    genReqId: () => randomUUID(),
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  app.decorate("config", options.config);
  app.decorate("db", options.db);
  app.decorateRequest("auth", null);

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: options.config.evidenceMaxBytes, fields: 4 },
  });

  app.addHook("onRequest", authenticateRequest);
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Request-Id", request.id);
    return payload;
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint tidak ditemukan.",
        request_id: request.id,
      },
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          request_id: request.id,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    const fastifyError = error as {
      validation?: Array<Record<string, unknown>>;
      statusCode?: number;
    };

    if (fastifyError.validation) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Permintaan tidak valid.",
          request_id: request.id,
          details: fastifyError.validation,
        },
      });
    }

    if (fastifyError.statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Terlalu banyak permintaan.",
          request_id: request.id,
        },
      });
    }

    if (fastifyError.statusCode === 413) {
      return reply.code(413).send({
        error: { code: "PAYLOAD_TOO_LARGE", message: "Isi permintaan terlalu besar.", request_id: request.id },
      });
    }

    if (
      typeof fastifyError.statusCode === "number" &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      return reply.code(fastifyError.statusCode).send({
        error: { code: "BAD_REQUEST", message: "Permintaan tidak valid.", request_id: request.id },
      });
    }

    request.log.error({ error }, "Unhandled request error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Terjadi kesalahan internal.",
        request_id: request.id,
      },
    });
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authenticationRoutes);
      await api.register(currentUserRoutes);
      await api.register(administrationRoutes);
      await api.register(governanceRoutes);
      await api.register(submissionRoutes);
      await api.register(executiveRoutes);
      await api.register(publicationRoutes);
      await api.register(assistantRoutes);
      await api.register(monitoringRoutes);
      await api.register(operationRoutes);
      await api.register(connectorRoutes);
      await api.register(consolidationRoutes);
      await api.register(opdProfileRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
