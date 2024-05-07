import assert from 'assert'
import {
  Receiver,
  Quote,
  OutgoingPayment,
  OutgoingPaymentState,
  CreateReceiverInput,
  IncomingPayment
} from '../generated/graphql'
import { MockASE } from '../mock-ase'
import { pollCondition } from '../utils'
import { WebhookEventType } from 'mock-account-service-lib'

interface AdminActionsDeps {
  sendingASE: MockASE
  receivingASE: MockASE
}

export interface AdminActions {
  createReceiver(createReceiverInput: CreateReceiverInput): Promise<Receiver>
  createQuote(senderWalletAddressId: string, receiver: Receiver): Promise<Quote>
  createOutgoingPayment(
    senderWalletAddressId: string,
    quote: Quote
  ): Promise<OutgoingPayment>
  getIncomingPayment(incomingPaymentId: string): Promise<IncomingPayment>
  getOutgoingPayment(
    outgoingPaymentId: string,
    amountValueToSend: string
  ): Promise<OutgoingPayment>
}

export function createAdminActions(deps: AdminActionsDeps): AdminActions {
  return {
    createReceiver: (createReceiverInput) =>
      createReceiver(deps, createReceiverInput),
    createQuote: (senderWalletAddressId, receiver) =>
      createQuote(deps, senderWalletAddressId, receiver),
    createOutgoingPayment: (senderWalletAddressId, quote) =>
      createOutgoingPayment(deps, senderWalletAddressId, quote),
    getIncomingPayment: (incomingPaymentId) =>
      getIncomingPayment(deps, incomingPaymentId),
    getOutgoingPayment: (outgoingPaymentId, amountValueToSend) =>
      getOutgoingPayment(deps, outgoingPaymentId, amountValueToSend)
  }
}

async function createReceiver(
  deps: AdminActionsDeps,
  createReceiverInput: CreateReceiverInput
): Promise<Receiver> {
  const { receivingASE, sendingASE } = deps
  const handleWebhookEventSpy = jest.spyOn(
    receivingASE.integrationServer.webhookEventHandler,
    'handleWebhookEvent'
  )
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
  deps: AdminActionsDeps,
  senderWalletAddressId: string,
  receiver: Receiver
): Promise<Quote> {
  const { sendingASE } = deps
  const response = await sendingASE.adminClient.createQuote({
    walletAddressId: senderWalletAddressId,
    receiver: receiver.id
  })

  expect(response.code).toBe('200')
  assert(response.quote)

  return response.quote
}
async function createOutgoingPayment(
  deps: AdminActionsDeps,
  senderWalletAddressId: string,
  quote: Quote
): Promise<OutgoingPayment> {
  const { sendingASE } = deps
  const handleWebhookEventSpy = jest.spyOn(
    sendingASE.integrationServer.webhookEventHandler,
    'handleWebhookEvent'
  )

  const response = await sendingASE.adminClient.createOutgoingPayment({
    walletAddressId: senderWalletAddressId,
    quoteId: quote.id
  })

  expect(response.code).toBe('201')
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
async function getOutgoingPayment(
  deps: AdminActionsDeps,
  outgoingPaymentId: string,
  amountValueToSend: string
): Promise<OutgoingPayment> {
  const { sendingASE } = deps
  const payment =
    await sendingASE.adminClient.getOutgoingPayment(outgoingPaymentId)
  payment.receiveAmount.value = BigInt(payment.receiveAmount.value)
  payment.sentAmount.value = BigInt(payment.sentAmount.value)
  payment.debitAmount.value = BigInt(payment.debitAmount.value)
  expect(payment.state).toBe(OutgoingPaymentState.Completed)
  expect(payment.receiveAmount.value).toBe(BigInt(amountValueToSend))
  return payment
}
async function getIncomingPayment(
  deps: AdminActionsDeps,
  incomingPaymentId: string
): Promise<IncomingPayment> {
  const { receivingASE } = deps
  const payment =
    await receivingASE.adminClient.getIncomingPayment(incomingPaymentId)

  if (payment.incomingAmount?.value) {
    payment.incomingAmount.value = BigInt(payment.incomingAmount.value)
  }
  payment.receivedAmount.value = BigInt(payment.receivedAmount.value)

  return payment
}
