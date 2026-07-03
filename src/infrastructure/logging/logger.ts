import { getEnv } from "@/lib/env";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function sanitize(fields: LogFields): LogFields {
  const redacted: LogFields = {};

  for (const [key, value] of Object.entries(fields)) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes("token") ||
      lowered.includes("authorization") ||
      lowered.includes("password") ||
      lowered.includes("secret") ||
      lowered.includes("apikey") ||
      lowered.includes("database_url")
    ) {
      redacted[key] = "[redacted]";
      continue;
    }

    redacted[key] = value;
  }

  return redacted;
}

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    service: "catchdrift",
    ...sanitize(fields),
    message,
  };

  // Keep local output readable and production output JSON.
  if (getEnv().NODE_ENV === "production") {
    console.log(JSON.stringify(payload));
    return;
  }

  console.log(`[${payload.ts}] ${level.toUpperCase()} ${message}`, sanitize(fields));
}

export const logger = {
  debug(message: string, fields?: LogFields) {
    write("debug", message, fields);
  },
  info(message: string, fields?: LogFields) {
    write("info", message, fields);
  },
  warn(message: string, fields?: LogFields) {
    write("warn", message, fields);
  },
  error(message: string, fields?: LogFields) {
    write("error", message, fields);
  },
};
