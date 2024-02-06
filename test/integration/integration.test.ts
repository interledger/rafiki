import { C9_CONFIG, HLB_CONFIG } from './lib/config'
import { MockASE } from './lib/MockASE'

describe('Open Payments Flow', (): void => {
  let c9: MockASE
  let hlb: MockASE

  beforeAll(async () => {
    c9 = await MockASE.create(C9_CONFIG)
    hlb = await MockASE.create(HLB_CONFIG)

    const walletAddressGet = await c9.opClient.walletAddress.get({
      url: 'http://localhost:4000/accounts/pfry'
    })
    console.log({ walletAddressGet })
  })

  afterAll(async () => {
    c9.shutdown()
    hlb.shutdown()
  })

  test('Grant Request Incoming Payment', async (): Promise<void> => {
    expect(true).toBe(false)
  })

  // test('Create Incoming Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Grant Request Quote', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Grant Request Quote', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Grant Request Outgoing Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Continuation Request', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Create Outgoing Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })
})
