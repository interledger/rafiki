import { AppContext } from '../../app'
import { IncomingPayment } from '../payment/incoming/model'

export interface ConnectionContext extends AppContext {
  incomingPayment: IncomingPayment
}

export const connectionMiddleware = async (
  ctx: Omit<ConnectionContext, 'incomingPayment'> & {
    incomingPayment: Partial<ConnectionContext['incomingPayment']>
  },
  next: () => Promise<unknown>
): Promise<void> => {
  const incomingPaymentService = await ctx.container.use(
    'incomingPaymentService'
  )
  const incomingPayment = await incomingPaymentService.getByConnection(
    ctx.params.id
  )
  if (!incomingPayment) return ctx.throw(404)
  ctx.incomingPayment = incomingPayment
  await next()
}
