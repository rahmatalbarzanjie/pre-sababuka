import type { AppConfig } from "../src/config.js";

export const testConfig: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 3001,
  logLevel: "silent",
  databaseUrl: "postgresql://unused",
  cookieSecure: false,
  sessionTtlSeconds: 3600,
  loginMaxFailures: 5,
  loginLockSeconds: 900,
  invitationTtlSeconds: 259_200,
  connectorEncryptionKey: Buffer.alloc(32, 8),
  evidenceStoragePath: "./tmp/test-evidence",
  evidenceMaxBytes: 10_485_760,
};
