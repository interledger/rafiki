import assert from 'assert'
import { MockASE } from './mock-ase'
import {
  Receiver,
  Quote,
  OutgoingPayment,
  OutgoingPaymentState,
  CreateReceiverInput
} from './generated/graphql'
import { pollCondition } from './utils'
import { WebhookEventType } from 'mock-account-service-lib'

interface TestActionDeps {
  sendingASE: MockASE
  receivingASE: MockASE
}

export interface TestActions {
  createReceiver(createReceiverInput: CreateReceiverInput): Promise<Receiver>
  createQuote(
    // TODO: refactor to senderWalletAddressId (its is sender right?). or senderWalletAddress
    walletAddressId: string,
    receiver: Receiver
  ): Promise<Quote>
  createOutgoingPayment(
    walletAddressId: string,
    quote: Quote
  ): Promise<OutgoingPayment>
  getOutgoingPayemnt(
    outgoingPaymentId: string,
    amountValueToSend: string
  ): Promise<OutgoingPayment>
}

export function createTestActions(deps: TestActionDeps): TestActions {
  return {
    createReceiver: (createReceiverInput) =>
      createReceiver(deps, createReceiverInput),
    createQuote: (walletAddressId, receiver) =>
      createQuote(deps, walletAddressId, receiver),
    createOutgoingPayment: (walletAddressId, quote) =>
      createOutgoingPayment(deps, walletAddressId, quote),
    getOutgoingPayemnt: (outgoingPaymentId, amountValueToSend) =>
      getOutgoingPayemnt(deps, outgoingPaymentId, amountValueToSend)
  }
}

async function createReceiver(
  deps: TestActionDeps,
  createReceiverInput: CreateReceiverInput
  // receiverWalletAddressUrl: string,
  // amountValueToSend: string
): Promise<Receiver> {
  const { receivingASE, sendingASE } = deps
  const handleWebhookEventSpy = jest.spyOn(
    receivingASE.integrationServer.webhookEventHandler,
    'handleWebhookEvent'
  )
  // TODO: paramaterize metadata and expect in getOutgoingPayemnt?
  // const response = await sendingASE.adminClient.createReceiver({
  //   metadata: {
  //     description: 'For lunch!'
  //   },
  //   incomingAmount: {
  //     assetCode: 'USD',
  //     assetScale: 2,
  //     value: amountValueToSend as unknown as bigint
  //   },
  //   walletAddressUrl: receiverWalletAddressUrl
  // })
  const response =
    await sendingASE.adminClient.createReceiver(createReceiverInput)

  expect(response.code).toBe('200')
  assert(response.receiver)

  await pollCondition(
    () => {
      return handleWebhookEventSpy.mock.calls.some(
        (call) => call[0]?.type === WebhookEventType.IncomingPaymentCreated
      )
    },
    5,
    0.5
  )

  expect(handleWebhookEventSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: WebhookEventType.IncomingPaymentCreated,
      data: expect.any(Object)
    })
  )

  return response.receiver
}
async function createQuote(
  deps: TestActionDeps,
  // TODO: refactor to senderWalletAddressId (its is sender right?). or senderWalletAddress
  walletAddressId: string,
  receiver: Receiver
): Promise<Quote> {
  const { sendingASE } = deps
  const response = await sendingASE.adminClient.createQuote({
    walletAddressId,
    receiver: receiver.id
  })

  expect(response.code).toBe('200')
  assert(response.quote)

  return response.quote
}
async function createOutgoingPayment(
  deps: TestActionDeps,
  walletAddressId: string,
  quote: Quote
): Promise<OutgoingPayment> {
  const { sendingASE } = deps
  const handleWebhookEventSpy = jest.spyOn(
    sendingASE.integrationServer.webhookEventHandler,
    'handleWebhookEvent'
  )

  const response = await sendingASE.adminClient.createOutgoingPayment({
    walletAddressId,
    quoteId: quote.id
  })

  expect(response.code).toBe('200')
  assert(response.payment)

  await pollCondition(
    () => {
      return (
        handleWebhookEventSpy.mock.calls.some(
          (call) => call[0]?.type === WebhookEventType.OutgoingPaymentCreated
        ) &&
        handleWebhookEventSpy.mock.calls.some(
          (call) => call[0]?.type === WebhookEventType.OutgoingPaymentCompleted
        )
      )
    },
    5,
    0.5
  )

  expect(handleWebhookEventSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: WebhookEventType.OutgoingPaymentCreated,
      data: expect.any(Object)
    })
  )
  expect(handleWebhookEventSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: WebhookEventType.OutgoingPaymentCompleted,
      data: expect.any(Object)
    })
  )

  return response.payment
}
async function getOutgoingPayemnt(
  deps: TestActionDeps,
  outgoingPaymentId: string,
  amountValueToSend: string
): Promise<OutgoingPayment> {
  const { sendingASE } = deps
  const payment =
    await sendingASE.adminClient.getOutgoingPayment(outgoingPaymentId)
  expect(payment.state).toBe(OutgoingPaymentState.Completed)
  expect(payment.receiveAmount.value).toBe(amountValueToSend)
  //
  // expect(payment.sentAmount.value).toBe(amountValueToSend)

  return payment
}
