import assert from 'assert'
import {
  Grant,
  GrantRequest,
  IncomingPayment,
  OutgoingPayment,
  PendingGrant,
  Quote,
  WalletAddress,
  isFinalizedGrant,
  isPendingGrant
} from '@interledger/open-payments'
import { MockASE } from '../mock-ase'
import { poll, pollCondition, wait } from '../utils'
import { WebhookEventType } from 'mock-account-service-lib'

export interface OpenPaymentsActionsDeps {
  sendingASE: MockASE
  receivingASE: MockASE
}

export interface OpenPaymentsActions {
  grantRequestIncomingPayment(
    receiverWalletAddress: WalletAddress
  ): Promise<Grant>
  createIncomingPayment(
    receiverWalletAddress: WalletAddress,
    amountValueToSend: string,
    accessToken: string
  ): Promise<IncomingPayment>
  grantRequestQuote(senderWalletAddress: WalletAddress): Promise<Grant>
  createQuote(
    senderWalletAddress: WalletAddress,
    accessToken: string,
    incomingPayment: IncomingPayment
  ): Promise<Quote>
  grantRequestOutgoingPayment(
    senderWalletAddress: WalletAddress,
    quote: Quote,
    finish?: InteractFinish
  ): Promise<PendingGrant>
  pollGrantContinue(outgoingPaymentGrant: PendingGrant): Promise<Grant>
  grantContinue(
    outgoingPaymentGrant: PendingGrant,
    interact_ref: string
  ): Promise<Grant>
  createOutgoingPayment(
    senderWalletAddress: WalletAddress,
    grant: Grant,
    quote: Quote
  ): Promise<OutgoingPayment>
  getOutgoingPayment(
    url: string,
    grantContinue: Grant
  ): Promise<OutgoingPayment>
}

export function createOpenPaymentsActions(
  deps: OpenPaymentsActionsDeps
): OpenPaymentsActions {
  return {
    grantRequestIncomingPayment: (receiverWalletAddress) =>
      grantRequestIncomingPayment(deps, receiverWalletAddress),
    createIncomingPayment: (
      receiverWalletAddress,
      amountValueToSend,
      accessToken
    ) =>
      createIncomingPayment(
        deps,
        receiverWalletAddress,
        amountValueToSend,
        accessToken
      ),
    grantRequestQuote: (senderWalletAddress) =>
      grantRequestQuote(deps, senderWalletAddress),
    createQuote: (senderWalletAddress, accessToken, incomingPayment) =>
      createQuote(deps, senderWalletAddress, accessToken, incomingPayment),
    grantRequestOutgoingPayment: (senderWalletAddress, quote, finish) =>
      grantRequestOutgoingPayment(deps, senderWalletAddress, quote, finish),
    pollGrantContinue: (outgoingPaymentGrant) =>
      pollGrantContinue(deps, outgoingPaymentGrant),
    grantContinue: (outgoingPaymentGrant, interact_ref) =>
      grantContinue(deps, outgoingPaymentGrant, interact_ref),
    createOutgoingPayment: (senderWalletAddress, grant, quote) =>
      createOutgoingPayment(deps, senderWalletAddress, grant, quote),
    getOutgoingPayment: (url, grantContinue) =>
      getOutgoingPayment(deps, url, grantContinue)
  }
}
async function grantRequestIncomingPayment(
  deps: OpenPaymentsActionsDeps,
  receiverWalletAddress: WalletAddress
): Promise<Grant> {
  const { sendingASE } = deps
  const grant = await sendingASE.opClient.grant.request(
    {
      url: receiverWalletAddress.authServer
    },
    {
      access_token: {
        access: [
          {
            type: 'incoming-payment',
            actions: ['create', 'read', 'list', 'complete']
          }
        ]
      }
    }
  )
  assert(!isPendingGrant(grant))
  return grant
}

async function createIncomingPayment(
  deps: OpenPaymentsActionsDeps,
  receiverWalletAddress: WalletAddress,
  amountValueToSend: string,
  accessToken: string
) {
  const { sendingASE, receivingASE } = deps
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)

  const handleWebhookEventSpy = jest.spyOn(
    receivingASE.integrationServer.webhookEventHandler,
    'handleWebhookEvent'
  )

  const incomingPayment = await sendingASE.opClient.incomingPayment.create(
    {
      url: receiverWalletAddress.resourceServer,
      accessToken
    },
    {
      walletAddress: receiverWalletAddress.id,
      incomingAmount: {
        value: amountValueToSend,
        assetCode: receiverWalletAddress.assetCode,
        assetScale: receiverWalletAddress.assetScale
      },
      metadata: { description: 'Free Money!' },
      expiresAt: tomorrow.toISOString()
    }
  )

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

  return incomingPayment
}

async function grantRequestQuote(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress
): Promise<Grant> {
  const { sendingASE } = deps
  const grant = await sendingASE.opClient.grant.request(
    {
      url: senderWalletAddress.authServer
    },
    {
      access_token: {
        access: [
          {
            type: 'quote',
            actions: ['read', 'create']
          }
        ]
      }
    }
  )
  assert(!isPendingGrant(grant))
  return grant
}

async function createQuote(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress,
  accessToken: string,
  incomingPayment: IncomingPayment
): Promise<Quote> {
  const { sendingASE } = deps
  return await sendingASE.opClient.quote.create(
    {
      url: senderWalletAddress.resourceServer,
      accessToken
    },
    {
      walletAddress: senderWalletAddress.id,
      receiver: incomingPayment.id.replace('https', 'http'),
      method: 'ilp'
    }
  )
}

type InteractFinish = NonNullable<GrantRequest['interact']>['finish']

async function grantRequestOutgoingPayment(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress,
  quote: Quote,
  finish?: InteractFinish
): Promise<PendingGrant> {
  const { receivingASE } = deps
  const grant = await receivingASE.opClient.grant.request(
    {
      url: senderWalletAddress.authServer
    },
    {
      access_token: {
        access: [
          {
            type: 'outgoing-payment',
            actions: ['create', 'read', 'list'],
            identifier: senderWalletAddress.id,
            limits: {
              debitAmount: quote.debitAmount,
              receiveAmount: quote.receiveAmount
            }
          }
        ]
      },
      interact: {
        start: ['redirect'],
        finish
      }
    }
  )

  assert(isPendingGrant(grant))

  if (grant.continue.wait) {
    // Delay following request according to the continue wait time (if any)
    await wait(grant.continue.wait * 1000)
  }

  return grant
}

async function pollGrantContinue(
  deps: OpenPaymentsActionsDeps,
  outgoingPaymentGrant: PendingGrant
): Promise<Grant> {
  const { sendingASE } = deps
  const { access_token, uri } = outgoingPaymentGrant.continue
  const grantContinue = await poll(
    async () =>
      sendingASE.opClient.grant.continue({
        accessToken: access_token.value,
        url: uri
      }),
    (responseData) => 'access_token' in responseData,
    20,
    5
  )

  assert(isFinalizedGrant(grantContinue))
  return grantContinue
}

async function grantContinue(
  deps: OpenPaymentsActionsDeps,
  outgoingPaymentGrant: PendingGrant,
  interact_ref: string
): Promise<Grant> {
  const { sendingASE } = deps
  const { access_token, uri } = outgoingPaymentGrant.continue
  const grantContinue = await sendingASE.opClient.grant.continue(
    {
      accessToken: access_token.value,
      url: uri
    },
    { interact_ref }
  )

  assert(isFinalizedGrant(grantContinue))
  return grantContinue
}

async function createOutgoingPayment(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress,
  grantContinue: Grant,
  quote: Quote
): Promise<OutgoingPayment> {
  const { sendingASE } = deps
  const handleWebhookEventSpy = jest.spyOn(
    sendingASE.integrationServer.webhookEventHandler,
    'handleWebhookEvent'
  )

  const outgoingPayment = await sendingASE.opClient.outgoingPayment.create(
    {
      url: senderWalletAddress.resourceServer,
      accessToken: grantContinue.access_token.value
    },
    {
      walletAddress: senderWalletAddress.id,
      metadata: {},
      quoteId: quote.id
    }
  )

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

  return outgoingPayment
}

async function getOutgoingPayment(
  deps: OpenPaymentsActionsDeps,
  url: string,
  grantContinue: Grant
) {
  const { sendingASE } = deps
  const outgoingPayment = await sendingASE.opClient.outgoingPayment.get({
    url,
    accessToken: grantContinue.access_token.value
  })

  expect(outgoingPayment.id).toBe(outgoingPayment.id)

  return outgoingPayment
}
