import assert from 'assert'
import {
  GrantRequest,
  GrantWithAccessToken,
  IncomingPayment,
  OutgoingPayment,
  OutgoingPaymentGrantSpentAmounts,
  PendingGrant,
  PublicIncomingPayment,
  Quote,
  WalletAddress,
  isFinalizedGrantWithAccessToken,
  isPendingGrant
} from '@interledger/open-payments'
import type { MockASE } from 'test-lib'
import { UnionOmit, poll, pollCondition, wait } from '../utils'
import { WebhookEventType } from 'mock-account-service-lib'
import {
  CreateOutgoingPaymentArgs,
  CreateIncomingPaymentArgs,
  JWK
} from '@interledger/open-payments/dist/types'

export interface OpenPaymentsActionsDeps {
  sendingASE: MockASE
  receivingASE: MockASE
}

export interface OpenPaymentsActions {
  grantRequestIncomingPayment(
    receiverWalletAddress: WalletAddress,
    clientOverride?: JWK
  ): Promise<GrantWithAccessToken>
  createIncomingPayment(
    receiverWalletAddress: WalletAddress,
    accessToken: string,
    opts?: CreateIncomingPaymentOpts,
    useDirectedIdentity?: boolean
  ): Promise<IncomingPayment>
  grantRequestQuote(
    senderWalletAddress: WalletAddress,
    clientOverride?: JWK
  ): Promise<GrantWithAccessToken>
  createQuote(
    senderWalletAddress: WalletAddress,
    accessToken: string,
    incomingPayment: IncomingPayment,
    useDirectedIdentity?: boolean
  ): Promise<Quote>
  grantRequestOutgoingPayment(
    senderWalletAddress: WalletAddress,
    limits: GrantRequestPaymentLimits,
    finish?: InteractFinish
  ): Promise<PendingGrant>
  pollGrantContinue(
    outgoingPaymentGrant: PendingGrant
  ): Promise<GrantWithAccessToken>
  grantContinue(
    outgoingPaymentGrant: PendingGrant,
    interact_ref: string
  ): Promise<GrantWithAccessToken>
  createOutgoingPayment(
    senderWalletAddress: WalletAddress,
    grant: GrantWithAccessToken,
    createArgs: UnionOmit<CreateOutgoingPaymentArgs, 'walletAddress'>
  ): Promise<OutgoingPayment>
  getOutgoingPayment(
    url: string,
    grantContinue: GrantWithAccessToken
  ): Promise<OutgoingPayment>
  getPublicIncomingPayment(
    url: string,
    amountValueToSend: string
  ): Promise<PublicIncomingPayment>
  getOutgoingPaymentGrantSpentAmounts(
    senderWalletAddress: WalletAddress,
    grant: GrantWithAccessToken
  ): Promise<OutgoingPaymentGrantSpentAmounts>
}

export function createOpenPaymentsActions(
  deps: OpenPaymentsActionsDeps
): OpenPaymentsActions {
  return {
    grantRequestIncomingPayment: (receiverWalletAddress, clientOverride) =>
      grantRequestIncomingPayment(deps, receiverWalletAddress, clientOverride),
    createIncomingPayment: (
      receiverWalletAddress,
      accessToken,
      opts,
      useDirectedIdentity
    ) =>
      createIncomingPayment(
        deps,
        receiverWalletAddress,
        accessToken,
        opts,
        useDirectedIdentity
      ),
    grantRequestQuote: (senderWalletAddress, clientOverride) =>
      grantRequestQuote(deps, senderWalletAddress, clientOverride),
    createQuote: (
      senderWalletAddress,
      accessToken,
      incomingPayment,
      useDirectedIdentity
    ) =>
      createQuote(
        deps,
        senderWalletAddress,
        accessToken,
        incomingPayment,
        useDirectedIdentity
      ),
    grantRequestOutgoingPayment: (senderWalletAddress, limits, finish) =>
      grantRequestOutgoingPayment(deps, senderWalletAddress, limits, finish),
    pollGrantContinue: (outgoingPaymentGrant) =>
      pollGrantContinue(deps, outgoingPaymentGrant),
    grantContinue: (outgoingPaymentGrant, interact_ref) =>
      grantContinue(deps, outgoingPaymentGrant, interact_ref),
    createOutgoingPayment: (senderWalletAddress, grant, createArgs) =>
      createOutgoingPayment(deps, senderWalletAddress, grant, createArgs),
    getOutgoingPayment: (url, grantContinue) =>
      getOutgoingPayment(deps, url, grantContinue),
    getPublicIncomingPayment: (url, amountValueToSend) =>
      getPublicIncomingPayment(deps, url, amountValueToSend),
    getOutgoingPaymentGrantSpentAmounts: (senderWalletAddress, grant) =>
      getOutgoingPaymentGrantSpentAmounts(deps, senderWalletAddress, grant)
  }
}
async function grantRequestIncomingPayment(
  deps: OpenPaymentsActionsDeps,
  receiverWalletAddress: WalletAddress,
  clientOverride?: JWK
): Promise<GrantWithAccessToken> {
  const { sendingASE } = deps

  const opClient = clientOverride
    ? sendingASE.directedIdentityOpClient
    : sendingASE.opClient

  const grant = await opClient.grant.request(
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
    },
    clientOverride && { jwk: clientOverride }
  )
  assert(isFinalizedGrantWithAccessToken(grant))
  return grant
}

type CreateIncomingPaymentOpts = {
  amountValueToSend?: string
  tenantId?: string
}

async function createIncomingPayment(
  deps: OpenPaymentsActionsDeps,
  receiverWalletAddress: WalletAddress,
  accessToken: string,
  opts?: CreateIncomingPaymentOpts,
  useDirectedIdentity?: boolean
) {
  const { sendingASE, receivingASE } = deps
  const { amountValueToSend } = opts ?? {}
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)

  const handleWebhookEventSpy = jest.spyOn(
    receivingASE.integrationServer.webhookEventHandler,
    'handleWebhookEvent'
  )

  const createInput: CreateIncomingPaymentArgs = {
    walletAddress: receiverWalletAddress.id,
    metadata: { description: 'Free Money!' },
    expiresAt: tomorrow.toISOString()
  }

  if (amountValueToSend) {
    createInput.incomingAmount = {
      value: amountValueToSend,
      assetCode: receiverWalletAddress.assetCode,
      assetScale: receiverWalletAddress.assetScale
    }
  }

  const opClient = useDirectedIdentity
    ? sendingASE.directedIdentityOpClient
    : sendingASE.opClient
  const incomingPayment = await opClient.incomingPayment.create(
    {
      url: receiverWalletAddress.resourceServer,
      accessToken
    },
    createInput
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
  senderWalletAddress: WalletAddress,
  clientOverride?: JWK
): Promise<GrantWithAccessToken> {
  const { sendingASE } = deps
  const opClient = clientOverride
    ? sendingASE.directedIdentityOpClient
    : sendingASE.opClient
  const grant = await opClient.grant.request(
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
    },
    clientOverride && { jwk: clientOverride }
  )
  assert(isFinalizedGrantWithAccessToken(grant))
  return grant
}

async function createQuote(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress,
  accessToken: string,
  incomingPayment: IncomingPayment,
  useDirectedIdentity?: boolean
): Promise<Quote> {
  const { sendingASE } = deps
  const opClient = useDirectedIdentity
    ? sendingASE.directedIdentityOpClient
    : sendingASE.opClient
  return await opClient.quote.create(
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
type Amount = { value: string; assetCode: string; assetScale: number }
type GrantRequestPaymentLimits =
  | { debitAmount: Amount; receiveAmount?: never }
  | { debitAmount?: never; receiveAmount: Amount }

async function grantRequestOutgoingPayment(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress,
  limits: GrantRequestPaymentLimits,
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
            limits
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
): Promise<GrantWithAccessToken> {
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

  assert(isFinalizedGrantWithAccessToken(grantContinue))
  return grantContinue
}

async function grantContinue(
  deps: OpenPaymentsActionsDeps,
  outgoingPaymentGrant: PendingGrant,
  interact_ref: string
): Promise<GrantWithAccessToken> {
  const { sendingASE } = deps
  const { access_token, uri } = outgoingPaymentGrant.continue
  const grantContinue = await sendingASE.opClient.grant.continue(
    {
      accessToken: access_token.value,
      url: uri
    },
    { interact_ref }
  )

  assert(isFinalizedGrantWithAccessToken(grantContinue))
  return grantContinue
}

async function createOutgoingPayment(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress,
  grantContinue: GrantWithAccessToken,
  createArgs: UnionOmit<CreateOutgoingPaymentArgs, 'walletAddress'>
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
      ...createArgs,
      walletAddress: senderWalletAddress.id
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
  grantContinue: GrantWithAccessToken
): Promise<OutgoingPayment> {
  const { sendingASE } = deps
  const outgoingPayment = await sendingASE.opClient.outgoingPayment.get({
    url,
    accessToken: grantContinue.access_token.value
  })

  expect(outgoingPayment.id).toBe(outgoingPayment.id)

  return outgoingPayment
}

async function getPublicIncomingPayment(
  deps: OpenPaymentsActionsDeps,
  url: string,
  expectedReceiveAmount: string
): Promise<PublicIncomingPayment> {
  const { receivingASE } = deps
  const incomingPayment = await receivingASE.opClient.incomingPayment.getPublic(
    { url }
  )

  assert(incomingPayment.receivedAmount)
  expect(incomingPayment.receivedAmount.value).toBe(expectedReceiveAmount)

  return incomingPayment
}

async function getOutgoingPaymentGrantSpentAmounts(
  deps: OpenPaymentsActionsDeps,
  senderWalletAddress: WalletAddress,
  grant: GrantWithAccessToken
): Promise<OutgoingPaymentGrantSpentAmounts> {
  const { sendingASE } = deps

  const spentAmounts =
    await sendingASE.opClient.outgoingPayment.getGrantSpentAmounts({
      url: senderWalletAddress.resourceServer,
      accessToken: grant.access_token.value
    })

  return spentAmounts
}
