import { getRequestId } from "./requestContext";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogContext {
  [key: string]: unknown;
}

/**
 * Structured logger with log-level filtering, request correlation,
 * and environment-aware output.
 *
 * Production: minified JSON lines (for Vercel Log Drain / Datadog / Axiom)
 * Development: colored human-readable lines
 */
class Logger {
  private module?: string;

  constructor(module?: string) {
    this.module = module;
  }

  /** Create a child logger with a module namespace */
  child(context: { module: string }): Logger {
    return new Logger(context.module);
  }

  debug(message: string, context?: LogContext) {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext) {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext) {
    this.log("error", message, context);
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[LOG_LEVEL]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(this.module && { module: this.module }),
      requestId: getRequestId(),
      ...context,
    };

    // Strip "no-request" to reduce noise
    if (entry.requestId === "no-request") delete entry.requestId;

    if (IS_PRODUCTION) {
      // JSON lines for log aggregation
      const output = JSON.stringify(entry);
      if (level === "error") {
        console.error(output);
      } else if (level === "warn") {
        console.warn(output);
      } else {
        console.log(output);
      }
    } else {
      // Human-readable colored output for development
      const color = COLORS[level];
      const moduleTag = this.module ? ` [${this.module}]` : "";
      const reqTag = entry.requestId ? ` req=${entry.requestId.slice(0, 12)}` : "";
      const contextStr = context && Object.keys(context).length > 0
        ? " " + JSON.stringify(context)
        : "";
      const prefix = `${color}${level.toUpperCase().padEnd(5)}${RESET}${moduleTag}${reqTag}`;
      
      if (level === "error") {
        console.error(`${prefix} ${message}${contextStr}`);
      } else if (level === "warn") {
        console.warn(`${prefix} ${message}${contextStr}`);
      } else {
        console.log(`${prefix} ${message}${contextStr}`);
      }
    }
  }
}

// ANSI colors for dev output
const RESET = "\x1b[0m";
const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gray
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
};

/** Default logger instance */
export const logger = new Logger();

export type { LogLevel, LogContext, Logger };
