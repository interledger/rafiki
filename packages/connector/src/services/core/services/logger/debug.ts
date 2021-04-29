import { LoggingService } from '.'
import debug from 'debug'
/**
 * A logger that emits events via the Koa app
 */
export class DebugLogger implements LoggingService {
  private _fatal: debug.IDebugger
  private _error: debug.IDebugger
  private _warn: debug.IDebugger
  private _info: debug.IDebugger
  private _debug: debug.IDebugger
  private _trace: debug.IDebugger
  constructor(namespace: string) {
    this._fatal = debug(namespace + ':fatal')
    this._error = debug(namespace + ':error')
    this._warn = debug(namespace + ':warn')
    this._info = debug(namespace + ':info')
    this._debug = debug(namespace + ':debug')
    this._trace = debug(namespace + ':trace')
  }

  public fatal(msg: string, ...args: unknown[]): void
  public fatal(
    obj: Record<string, unknown>,
    msg?: string,
    ...args: unknown[]
  ): void
  public fatal(
    msgOrObj: string | Record<string, unknown>,
    msgOrArgs?: string | unknown[],
    ...args: unknown[]
  ): void {
    this._fatal(msgOrObj, msgOrArgs, args)
  }

  public error(msg: string, ...args: unknown[]): void
  public error(
    obj: Record<string, unknown>,
    msg?: string,
    ...args: unknown[]
  ): void
  public error(
    msgOrObj: string | Record<string, unknown>,
    msgOrArgs?: string | unknown[],
    ...args: unknown[]
  ): void {
    this._error(msgOrObj, msgOrArgs, args)
  }

  public warn(msg: string, ...args: unknown[]): void
  public warn(
    obj: Record<string, unknown>,
    msg?: string,
    ...args: unknown[]
  ): void
  public warn(
    msgOrObj: string | Record<string, unknown>,
    msgOrArgs?: string | unknown[],
    ...args: unknown[]
  ): void {
    this._warn(msgOrObj, msgOrArgs, args)
  }

  public info(msg: string, ...args: unknown[]): void
  public info(
    obj: Record<string, unknown>,
    msg?: string,
    ...args: unknown[]
  ): void
  public info(
    msgOrObj: string | Record<string, unknown>,
    msgOrArgs?: string | unknown[],
    ...args: unknown[]
  ): void {
    this._info(msgOrObj, msgOrArgs, args)
  }

  public debug(msg: string, ...args: unknown[]): void
  public debug(
    obj: Record<string, unknown>,
    msg?: string,
    ...args: unknown[]
  ): void
  public debug(
    msgOrObj: string | Record<string, unknown>,
    msgOrArgs?: string | unknown[],
    ...args: unknown[]
  ): void {
    this._debug(msgOrObj, msgOrArgs, args)
  }

  public trace(msg: string, ...args: unknown[]): void
  public trace(
    obj: Record<string, unknown>,
    msg?: string,
    ...args: unknown[]
  ): void
  public trace(
    msgOrObj: string | Record<string, unknown>,
    msgOrArgs?: string | unknown[],
    ...args: unknown[]
  ): void {
    this._trace(msgOrObj, msgOrArgs, args)
  }
}
