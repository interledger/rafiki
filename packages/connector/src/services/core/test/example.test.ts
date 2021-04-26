import { IlpPrepareFactory, PeerInfoFactory } from '../factories'

test('Example test', async () => {
  const prepare = IlpPrepareFactory.build({ destination: 'test.rafiki.alice' })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const peerInfo = PeerInfoFactory.build()

  expect(prepare.destination).toBe('test.rafiki.alice')
})
