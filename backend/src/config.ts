export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  loginMaxFailures: number;
  loginLockSeconds: number;
  invitationTtlSeconds: number;
  connectorEncryptionKey: Buffer | null;
  evidenceStoragePath: string;
  evidenceMaxBytes: number;
}

function integerEnv(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} harus berupa bilangan bulat minimal ${minimum}.`);
  }
  return value;
}

function booleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} harus bernilai true atau false.`);
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv)) {
    throw new Error("NODE_ENV harus development, test, atau production.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL wajib diatur.");

  const rawConnectorKey = process.env.CONNECTOR_ENCRYPTION_KEY;
  let connectorEncryptionKey: Buffer | null = null;
  if (rawConnectorKey) {
    connectorEncryptionKey = Buffer.from(rawConnectorKey, "base64");
    if (connectorEncryptionKey.length !== 32) {
      throw new Error("CONNECTOR_ENCRYPTION_KEY harus berupa base64 dari tepat 32 byte.");
    }
  }

  return {
    nodeEnv: nodeEnv as AppConfig["nodeEnv"],
    host: process.env.HOST ?? "127.0.0.1",
    port: integerEnv("PORT", 3001, 1),
    logLevel: process.env.LOG_LEVEL ?? "info",
    databaseUrl,
    cookieSecure: booleanEnv("COOKIE_SECURE", nodeEnv === "production"),
    sessionTtlSeconds: integerEnv("SESSION_TTL_SECONDS", 43_200, 300),
    loginMaxFailures: integerEnv("LOGIN_MAX_FAILURES", 5, 1),
    loginLockSeconds: integerEnv("LOGIN_LOCK_SECONDS", 900, 60),
    invitationTtlSeconds: integerEnv("INVITATION_TTL_SECONDS", 259_200, 900),
    connectorEncryptionKey,
    evidenceStoragePath: process.env.EVIDENCE_STORAGE_PATH ?? "./storage/evidence",
    evidenceMaxBytes: integerEnv("EVIDENCE_MAX_BYTES", 10_485_760, 1_024),
  };
}
