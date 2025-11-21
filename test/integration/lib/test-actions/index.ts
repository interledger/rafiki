import assert from 'assert'
import { createHash } from 'crypto'
import type { MockASE } from 'test-lib'
import { parseCookies, urlWithoutTenantId } from '../utils'
import { WalletAddress, PendingGrant } from '@interledger/open-payments'
import { AdminActions, createAdminActions } from './admin'
import { OpenPaymentsActions, createOpenPaymentsActions } from './open-payments'
import { POSActions, createPOSActions } from './pos'

export interface TestActionsDeps {
  sendingASE: MockASE
  receivingASE: MockASE
}

interface InteractionArgs {
  clientNonce: string
  initialGrantUrl: string
  finishUri: string
}

export interface TestActions {
  consentInteraction(
    outgoingPaymentGrant: PendingGrant,
    senderWalletAddress: WalletAddress
  ): Promise<void>
  consentInteractionWithInteractRef(
    outgoingPaymentGrant: PendingGrant,
    senderWalletAddress: WalletAddress,
    args: InteractionArgs
  ): Promise<string>
  admin: AdminActions
  openPayments: OpenPaymentsActions
  pos: POSActions
}

export function createTestActions(deps: TestActionsDeps): TestActions {
  return {
    consentInteraction: (outgoingPaymentGrant, senderWalletAddress) =>
      consentInteraction(deps, outgoingPaymentGrant, senderWalletAddress),
    consentInteractionWithInteractRef: (
      outgoingPaymentGrant,
      senderWalletAddress,
      args
    ) =>
      consentInteractionWithInteractRef(
        deps,
        outgoingPaymentGrant,
        senderWalletAddress,
        args
      ),
    admin: createAdminActions(deps),
    openPayments: createOpenPaymentsActions(deps),
    pos: createPOSActions(deps)
  }
}

async function consentInteraction(
  deps: TestActionsDeps,
  outgoingPaymentGrant: PendingGrant,
  senderWalletAddress: WalletAddress
) {
  const { idpSecret } = deps.sendingASE.config
  const { interactId, nonce, cookie } = await _startAndAcceptInteraction(
    deps,
    outgoingPaymentGrant,
    idpSecret
  )

  // Finish interaction
  const finishResponse = await fetch(
    `${urlWithoutTenantId(senderWalletAddress.authServer)}/interact/${interactId}/${nonce}/finish`,
    {
      method: 'GET',
      headers: {
        'x-idp-secret': idpSecret,
        cookie
      }
    }
  )
  expect(finishResponse.status).toBe(202)
}

async function consentInteractionWithInteractRef(
  deps: TestActionsDeps,
  outgoingPaymentGrant: PendingGrant,
  senderWalletAddress: WalletAddress,
  interactionArgs: InteractionArgs
): Promise<string> {
  const { idpSecret } = deps.sendingASE.config
  const { interactId, nonce, cookie } = await _startAndAcceptInteraction(
    deps,
    outgoingPaymentGrant,
    idpSecret
  )

  // Finish interaction
  const finishResponse = await fetch(
    `${urlWithoutTenantId(senderWalletAddress.authServer)}/interact/${interactId}/${nonce}/finish`,
    {
      method: 'GET',
      headers: {
        'x-idp-secret': idpSecret,
        cookie
      },
      redirect: 'manual' // dont follow redirects
    }
  )
  expect(finishResponse.status).toBe(302)

  const redirectURI = finishResponse.headers.get('location')
  assert(redirectURI)
  expect(redirectURI.startsWith(interactionArgs.finishUri))

  const url = new URL(redirectURI)
  const interact_ref = url.searchParams.get('interact_ref')
  const hash = url.searchParams.get('hash')

  assert(hash)
  assert(interact_ref)

  verifyHash({
    initialGrantUrl: interactionArgs.initialGrantUrl,
    clientNonce: interactionArgs.clientNonce,
    interactNonce: nonce,
    receivedHash: hash,
    interactRef: interact_ref
  })
  assert(interact_ref)

  return interact_ref
}

interface VerifyHashArgs {
  clientNonce: string
  initialGrantUrl: string
  receivedHash: string
  interactNonce: string
  interactRef: string
}

async function verifyHash(args: VerifyHashArgs) {
  const {
    clientNonce,
    interactNonce,
    interactRef,
    initialGrantUrl,
    receivedHash
  } = args
  const data = `${clientNonce}\n${interactNonce}\n${interactRef}\n${initialGrantUrl}`
  const hash = createHash('sha-256').update(data).digest('base64')

  expect(hash).toBe(receivedHash)
}

async function _startAndAcceptInteraction(
  deps: TestActionsDeps,
  outgoingPaymentGrant: PendingGrant,
  idpSecret: string
): Promise<{ nonce: string; interactId: string; cookie: string }> {
  const { redirect: startInteractionUrl } = outgoingPaymentGrant.interact

  // Start interaction
  const interactResponse = await fetch(startInteractionUrl, {
    redirect: 'manual' // dont follow redirects
  })
  expect(interactResponse.status).toBe(302)

  const cookie = parseCookies(interactResponse)

  const nonce = outgoingPaymentGrant.interact.finish
  const tokens = startInteractionUrl.split('/interact/')
  const interactId = tokens[1] ? tokens[1].split('/')[0] : null
  assert(interactId)

  // Accept
  const acceptResponse = await fetch(
    `${deps.sendingASE.config.interactionServer}/grant/${interactId}/${nonce}/accept`,
    {
      method: 'POST',
      headers: {
        'x-idp-secret': idpSecret,
        cookie
      }
    }
  )

  expect(acceptResponse.status).toBe(202)

  return { nonce, interactId, cookie }
}
