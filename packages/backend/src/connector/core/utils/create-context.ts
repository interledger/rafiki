import Koa from 'koa'
import { Errors } from 'ilp-packet'
import {
  MockIncomingMessageOptions,
  MockIncomingMessage,
  MockServerResponse
} from '.'
import { ILPContext } from '..'

export type Options<StateT, CustomT> = {
  app?: Koa<StateT, CustomT>
  req?: MockIncomingMessageOptions
  res?: () => void
  state?: StateT
  [name: string]: unknown
} & Partial<Omit<CustomT, 'res' | 'req'>>

export function createContext<StateT = unknown, CustomT = unknown>(
  options: Options<StateT, CustomT> = {}
): Koa.ParameterizedContext<StateT, CustomT> {
  const app = options.app || new Koa<StateT, CustomT>()
  const req = new MockIncomingMessage(options.req || {})
  const res = new MockServerResponse(req, options.res)
  const context = app.createContext<StateT>(req, res)

  Object.keys(options).forEach((key) => {
    if (key !== 'req' && key !== 'res') {
      context[key] = options[key]
    }
  })

  return context as Koa.ParameterizedContext<StateT, CustomT>
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function createILPContext<StateT = any>(
  options: Partial<ILPContext<StateT>>
): ILPContext<StateT> {
  // If the caller needs more parameters they can provide them.
  return ({
    request: {},
    response: {},
    state: {},
    throw: (code: number, msg: string): never => {
      throw new Errors.BadRequestError(msg)
    },
    ...options
  } as unknown) as ILPContext<StateT>
}
