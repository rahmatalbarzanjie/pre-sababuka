export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_ROLE_SCOPE"
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_PENDING"
  | "INVITATION_INVALID"
  | "PERMISSION_DENIED"
  | "SCOPE_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_INVALID"
  | "CONNECTOR_WAITING_KEY"
  | "CONNECTOR_NOT_READY"
  | "UNSUPPORTED_FORMAT"
  | "SOURCE_RESOURCE_NOT_FOUND"
  | "CONFIGURATION_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: Array<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
