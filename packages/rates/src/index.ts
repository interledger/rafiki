import createLogger from 'pino'
import { createECBService } from './ecb/service'
import { createXRPService } from './xrp/service'
import { createHTTPService, HTTPService } from './http/service'
import { config as envConfig, Config } from './config'

export type App = HTTPService

export async function createApp(config: Config): Promise<App> {
  const ecbService = createECBService()
  const xrpService = createXRPService()
  const logger = createLogger()
  const server = await createHTTPService({
    config,
    logger,
    ecbService,
    xrpService
  })
  return server
}

export async function shutdownApp(app: App): Promise<void> {
  await new Promise((resolve, reject) => {
    app.close((err) => (err ? reject(err) : resolve(null)))
  })
}

// If this script is run directly, start the server
if (!module.parent) {
  createApp(envConfig).catch(
    async (e): Promise<void> => {
      const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
      console.error(errInfo)
    }
  )
}
