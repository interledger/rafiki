import { createApp } from './app'
import logger from './logger'
;(async () => {
  const start = createApp(Number(process.env['HTTP_SIGN_API_PORT'] ?? 5001))
  await start()

  process.on('SIGINT', () => {
    logger.info('Received SIGINT. Shutting down gracefully...')
    process.exit(0)
  })
})()
