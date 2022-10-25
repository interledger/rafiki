import createLogger from 'pino'
import { createAxiosInstance } from '../client/requests'

export const silentLogger = createLogger({
  level: 'silent'
})

export const defaultAxiosInstance = createAxiosInstance({ requestTimeoutMs: 0 })
