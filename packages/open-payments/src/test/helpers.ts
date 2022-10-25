import createLogger from 'pino'

export const silentLogger = createLogger({
  level: 'silent'
})
