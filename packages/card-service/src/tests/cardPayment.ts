import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import { CreateCardPaymentOptions } from '../card-payment/service'
import { CardPayment } from '../card-payment/model'

export const randomCardPayment = (): CreateCardPaymentOptions => ({
  requestId: uuid(),
  requestedAt: new Date(),
  cardWalletAddress: `https://wallet-${uuid().slice(0, 8)}.example/.well-known/pay`,
  incomingPaymentUrl: `https://backend-${uuid().slice(0, 8)}.example/incoming-payments/${uuid()}`,
  terminalId: uuid()
})

export const createCardPayment = async (
  deps: IocContract<AppServices>,
  options?: Partial<CreateCardPaymentOptions>
): Promise<CardPayment> => {
  const { createAuditLogService } = await import('../card-payment/service')
  const auditLogService = await createAuditLogService({
    logger: await deps.use('logger'),
    knex: await deps.use('knex')
  })

  return await auditLogService.create({
    ...randomCardPayment(),
    ...options
  })
}
