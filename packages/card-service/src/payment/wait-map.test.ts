import { paymentWaitMap } from './wait-map'
import { Deferred } from '../utils/deferred'
import { PaymentEventBody } from './types'

describe('paymentWaitMap', () => {
  test('stores and retrieves Deferreds by key', () => {
    const d = new Deferred<PaymentEventBody>()
    paymentWaitMap.set('abc', d)
    expect(paymentWaitMap.get('abc')).toBe(d)
    paymentWaitMap.delete('abc')
    expect(paymentWaitMap.get('abc')).toBeUndefined()
  })
})
