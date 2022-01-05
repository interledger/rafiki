import { IocContract } from '@adonisjs/fold'
import * as Pay from '@interledger/pay'
import assert from 'assert'

import { randomAsset } from './asset'
import { AppServices } from '../app'
import { isCreateError } from '../outgoing_payment/errors'
import { OutgoingPayment } from '../outgoing_payment/model'
import { CreateOutgoingPaymentOptions } from '../outgoing_payment/service'

export class PaymentFactory {
  public constructor(private deps: IocContract<AppServices>) {}

  public async build(
    options: Partial<CreateOutgoingPaymentOptions> = {}
  ): Promise<OutgoingPayment> {
    const accountService = await this.deps.use('accountService')
    const accountId =
      options.accountId ||
      (
        await accountService.create({
          asset: randomAsset()
        })
      ).id

    let paymentOptions: CreateOutgoingPaymentOptions

    if (options.invoiceUrl) {
      paymentOptions = {
        accountId,
        invoiceUrl: options.invoiceUrl
      }
    } else {
      paymentOptions = {
        accountId,
        paymentPointer:
          options.paymentPointer || 'http://wallet2.example/paymentpointer/bob',
        amountToSend: options.amountToSend || BigInt(123)
      }
    }

    const streamServer = await this.deps.use('streamServer')
    const {
      ilpAddress: destinationAddress,
      sharedSecret
    } = streamServer.generateCredentials()
    jest.spyOn(Pay, 'setupPayment').mockResolvedValueOnce({
      destinationAsset: {
        scale: 9,
        code: 'XRP'
      },
      accountUrl: 'http://wallet2.example/paymentpointer/bob',
      destinationAddress,
      sharedSecret,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      requestCounter: Pay.Counter.from(0)!
    })

    const outgoingPaymentService = await this.deps.use('outgoingPaymentService')
    const payment = await outgoingPaymentService.create(paymentOptions)
    assert.ok(!isCreateError(payment))

    return payment
  }
}
