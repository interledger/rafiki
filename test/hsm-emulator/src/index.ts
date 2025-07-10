import { createApp } from './app'
import logger from './logger'
;(async () => {
  const start = createApp(
    Number(process.env['HTTP_HSM_EMULATOR_API_PORT'] ?? 5002)
  )
  await start()

  process.on('SIGINT', () => {
    logger.info('Received SIGINT. Shutting down gracefully...')
    process.exit(0)
  })
})()
