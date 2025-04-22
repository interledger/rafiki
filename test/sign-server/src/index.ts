import { createApp } from './app'
import logger from './logger'
;(async () => {
  const start = createApp(Number(process.env['API_PORT'] ?? 3000))
  await start()

  process.on('SIGINT', () => {
    logger.info('Received SIGINT. Shutting down gracefully...')
    process.exit(0)
  })
})()
