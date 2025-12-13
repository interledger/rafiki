import { AccessRequest } from '../access/types'
import { IAppConfig } from '../config/app'
import { GrantRequest } from './service'
import { canSkipInteraction } from './utils'
import { AccessAction } from '@interledger/open-payments'

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

describe('canSkipInteraction', () => {
  it('returns false if no access_token and has sub_ids', () => {
    const body: GrantRequest = {
      subject: { sub_ids: [{ id: 'http://wallet.url', format: 'url' }] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(false)
  })

  it('returns true if all access can be skipped', () => {
    const body: GrantRequest = {
      subject: { sub_ids: [] },
      access_token: { access: [incomingPaymentAccess, quoteAccess] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(true)
  })

  it('returns false if some access cannot be skipped', () => {
    const body: GrantRequest = {
      subject: { sub_ids: [] },
      access_token: { access: [incomingPaymentAccess, outgoingPaymentAccess] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(false)
  })

  it('throws if identifier is missing for non-skippable access', () => {
    const config = { ...mockConfig, incomingPaymentInteraction: true }
    const body: GrantRequest = {
      access_token: { access: [{ ...incomingPaymentAccess, identifier: '' }] },
      client: 'foo'
    }
    expect(() => canSkipInteraction(config, body)).toThrow(
      'identifier required'
    )
  })

  it('returns false if subject has sub_ids even if access can be skipped', () => {
    const body: GrantRequest = {
      subject: { sub_ids: [{ id: 'http://wallet.url', format: 'url' }] },
      access_token: { access: [incomingPaymentAccess] },
      client: 'foo'
    }
    expect(canSkipInteraction(mockConfig, body)).toBe(false)
  })

  it('throws if no access and no subject', () => {
    const body: GrantRequest = {
      client: 'foo'
    }
    expect(() => canSkipInteraction(mockConfig, body)).toThrow(
      'subject or access_token required'
    )
  })
})
