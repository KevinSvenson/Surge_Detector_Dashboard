/**
 * Structured logging infrastructure.
 * Provides consistent logging with levels, timestamps, and context.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: LogContext;
  error?: Error;
}

class Logger {
  private minLevel: LogLevel;
  private context: LogContext;

  constructor(minLevel: LogLevel = "info", baseContext: LogContext = {}) {
    this.minLevel = minLevel;
    this.context = baseContext;
  }

  /**
   * Create a child logger with additional context.
   */
  child(additionalContext: LogContext): Logger {
    return new Logger(this.minLevel, { ...this.context, ...additionalContext });
  }

  /**
   * Set minimum log level.
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext, error?: Error): string {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    const errorStr = error ? ` Error: ${error.message}${error.stack ? `\n${error.stack}` : ""}` : "";
    return `[${timestamp}] ${levelUpper} ${message}${contextStr}${errorStr}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formatted = this.formatMessage(level, message, context, error);

    // Output to console with appropriate method
    switch (level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log("error", message, context, error);
  }
}

// Default logger instance
export const logger = new Logger(
  (process.env.LOG_LEVEL as LogLevel) || "info",
  { service: "crypto-dashboard-backend" }
);

// Export Logger class for creating custom loggers
export { Logger };

