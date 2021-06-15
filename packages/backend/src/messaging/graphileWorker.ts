import { Config } from '../config/app'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'

function initWorker(): Promise<WorkerUtils> {
  return makeWorkerUtils({
    connectionString: Config.databaseUrl
  })
}

export const workerUtils = initWorker()
