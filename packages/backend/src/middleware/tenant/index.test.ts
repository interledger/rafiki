import { tenantIdToProceed } from './index'

describe('Set For Tenant', (): void => {
  test('test tenant id to proceed', async (): Promise<void> => {
    const sig = 'sig'
    const tenantId = 'tenantId'
    expect(tenantIdToProceed(false, sig)).toBe(sig)
    expect(tenantIdToProceed(false, sig, tenantId)).toBeUndefined()
    expect(tenantIdToProceed(false, sig, sig)).toBe(sig)
    expect(tenantIdToProceed(true, sig)).toBe(sig)
    expect(tenantIdToProceed(true, sig, tenantId)).toBe(tenantId)
  })
})
