import Koa from 'koa'
import {
  MockIncomingMessageOptions,
  MockIncomingMessage,
  MockServerResponse
} from '.'

export type Options<StateT, CustomT> = {
  app?: Koa<StateT, CustomT>
  req?: MockIncomingMessageOptions
  res?: () => void
  state?: StateT
  [name: string]: any
} & Partial<Omit<CustomT, 'res' | 'req'>>

export function createContext<StateT = any, CustomT = any>(
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
