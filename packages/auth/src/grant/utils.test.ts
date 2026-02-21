import { AccessRequest } from '../access/types'
import { IAppConfig } from '../config/app'
import { CreateGrantInput } from './service'
import { canSkipInteraction, parseRawClientField } from './utils'
import { AccessAction } from '@interledger/open-payments'
import { JWK } from 'token-introspection'

const mockConfig = {
  incomingPaymentInteraction: false,
  quoteInteraction: false,
  listAllInteraction: false
} as IAppConfig

const incomingPaymentAccess: AccessRequest = {
  type: 'incoming-payment',
  actions: [AccessAction.Read],
  identifier: 'id'
}

const quoteAccess: AccessRequest = {
  type: 'quote',
  actions: [AccessAction.Read],
  identifier: 'id'
}

const outgoingPaymentAccess: AccessRequest = {
  type: 'outgoing-payment',
  actions: [AccessAction.Create],
  identifier: 'id'
}

describe('parseRawClientField', () => {
  const testJwk: JWK = {
    kid: 'test-key-1',
    alg: 'EdDSA',
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'test-x-value'
  }

  it('normalizes a string client to { client }', () => {
    expect(parseRawClientField('https://wallet.example')).toEqual({
      client: 'https://wallet.example'
    })
  })

  it('normalizes a { walletAddress } client to { client }', () => {
    expect(
      parseRawClientField({ walletAddress: 'https://wallet.example' })
    ).toEqual({
      client: 'https://wallet.example'
    })
  })

  it('normalizes a { jwk } client to { jwk }', () => {
    expect(parseRawClientField({ jwk: testJwk })).toEqual({
      jwk: testJwk
    })
  })
})

describe('canSkipInteraction', () => {
  it('returns false if no access_token and has sub_ids', () => {
    const body: CreateGrantInput = {
      subject: { sub_ids: [{ id: 'http://wallet.url', format: 'url' }] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(false)
  })

  it('returns true if all access can be skipped', () => {
    const body: CreateGrantInput = {
      subject: { sub_ids: [] },
      access_token: { access: [incomingPaymentAccess, quoteAccess] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(true)
  })

  it('returns false if some access cannot be skipped', () => {
    const body: CreateGrantInput = {
      subject: { sub_ids: [] },
      access_token: { access: [incomingPaymentAccess, outgoingPaymentAccess] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(false)
  })

  it('throws if identifier is missing for non-skippable access', () => {
    const config = { ...mockConfig, incomingPaymentInteraction: true }
    const body: CreateGrantInput = {
      access_token: { access: [{ ...incomingPaymentAccess, identifier: '' }] },
      client: 'foo'
    }
    expect(() => canSkipInteraction(config, body)).toThrow(
      'identifier required'
    )
  })

  it('returns false if subject has sub_ids even if access can be skipped', () => {
    const body: CreateGrantInput = {
      subject: { sub_ids: [{ id: 'http://wallet.url', format: 'url' }] },
      access_token: { access: [incomingPaymentAccess] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(false)
  })

  it('throws if no access and no subject', () => {
    const body: CreateGrantInput = {
      client: 'foo'
    }
    expect(() => canSkipInteraction(mockConfig, body)).toThrow(
      'subject or access_token required'
    )
  })
})
