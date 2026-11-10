import type { FastifyRequest } from "fastify";
import { ApiError } from "../errors.js";
import { hashToken, tokensMatch } from "../security/tokens.js";
import { AuthService } from "../services/auth-service.js";

export const SESSION_COOKIE_NAME = "sababuka_session";

const PUBLIC_PATHS = new Set([
  "/api/v1/health",
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/registration-organizations",
]);

function isPublicRequest(request: FastifyRequest): boolean {
  const path = request.url.split("?", 1)[0]!;
  return PUBLIC_PATHS.has(path) || /^\/api\/v1\/auth\/invitations\/[^/]+(?:\/accept)?$/u.test(path);
}

export function authService(request: FastifyRequest): AuthService {
  return new AuthService(request.server.db, request.server.config);
}

export async function authenticateRequest(request: FastifyRequest): Promise<void> {
  request.auth = null;
  if (isPublicRequest(request)) return;

  const sessionToken = request.cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) throw new ApiError(401, "AUTH_REQUIRED", "Sesi diperlukan.");

  const auth = await authService(request).getAuthContext(hashToken(sessionToken));
  if (!auth) throw new ApiError(401, "AUTH_REQUIRED", "Sesi tidak valid atau telah kedaluwarsa.");
  const previewRole = request.headers["x-sababuka-preview-role"];
  const previewOrganization = request.headers["x-sababuka-preview-organization"];
  request.auth = typeof previewRole === "string"
    ? await authService(request).getPreviewAuthContext(auth, previewRole, typeof previewOrganization === "string" ? previewOrganization : undefined)
    : auth;
}

export function requireCsrf(request: FastifyRequest): void {
  if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sesi diperlukan.");
  if (request.auth.user.simulation?.active) throw new ApiError(403, "PERMISSION_DENIED", "Mode pratinjau hanya untuk melihat. Kembali ke Developer untuk melakukan perubahan.");
  const token = request.headers["x-csrf-token"];
  if (typeof token !== "string" || !tokensMatch(token, request.auth.csrfTokenHash)) {
    throw new ApiError(403, "PERMISSION_DENIED", "Token CSRF tidak valid.");
  }
}

export function requirePermission(request: FastifyRequest, permission: string): void {
  if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sesi diperlukan.");
  if (!request.auth.user.permissions.includes(permission)) {
    throw new ApiError(403, "PERMISSION_DENIED", "Anda tidak memiliki izin untuk tindakan ini.");
  }
}

export function requireSuperadmin(request: FastifyRequest): void {
  if (!request.auth) throw new ApiError(401, "AUTH_REQUIRED", "Sesi diperlukan.");
  if (!request.auth.user.roles.some((role) => role.code === "superadmin" && role.scope_type === "global")) {
    throw new ApiError(403, "PERMISSION_DENIED", "Tindakan ini hanya tersedia untuk Superadmin SABABUKA.");
  }
}
