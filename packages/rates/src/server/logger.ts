export interface LoggingService {
  fatal: LogFn
  error: LogFn
  warn: LogFn
  info: LogFn
  debug: LogFn
  trace: LogFn
}

interface LogFn {
  (msg: string, ...args: unknown[]): void
  (obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void
}
