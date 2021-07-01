import { createApp, shutdownApp } from '.'
import { config } from './config'

describe('App', function () {
  it('starts and closes cleanly', async () => {
    const app = await createApp(config)
    await shutdownApp(app)
  })
})
