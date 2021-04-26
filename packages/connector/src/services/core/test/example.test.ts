import { IlpPrepareFactory, PeerInfoFactory } from '../factories'

test('Example test', async () => {
  const prepare = IlpPrepareFactory.build({ destination: 'test.rafiki.alice' })
  const peerInfo = PeerInfoFactory.build()

  expect(prepare.destination).toBe('test.rafiki.alice')
})
