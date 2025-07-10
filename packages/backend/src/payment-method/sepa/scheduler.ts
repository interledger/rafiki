import { BaseService } from '../../shared/baseService'
import { SepaPaymentService } from './service'

export interface SepaScheduler {
  start(): void
  stop(): void
}

interface ServiceDependencies extends BaseService {
  sepaPaymentService: SepaPaymentService
}

export async function createSepaScheduler({
  logger,
  sepaPaymentService: sepaPaymentService
}: ServiceDependencies): Promise<SepaScheduler> {
  const log = logger.child({
    service: 'SepaScheduler'
  })

  const deps: ServiceDependencies = {
    logger: log,
    sepaPaymentService: sepaPaymentService
  }

  let intervalId: NodeJS.Timeout | undefined

  return {
    start: () => startScheduler(deps, intervalId),
    stop: () => stopScheduler(deps, intervalId)
  }
}

function startScheduler(
  deps: ServiceDependencies,
  intervalId: NodeJS.Timeout | undefined
): void {
  if (intervalId) {
    deps.logger.warn('SEPA scheduler is already running')
    return
  }

  // Every 24 hours
  const FEE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

  intervalId = setInterval(async () => {
    try {
      deps.logger.info('Starting daily SEPA fees refresh')
      await deps.sepaPaymentService.refreshFees()
      deps.logger.info('Completed daily SEPA fees refresh')
    } catch (error) {
      deps.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Error during daily SEPA fees refresh'
      )
    }
  }, FEE_REFRESH_INTERVAL_MS)

  deps.logger.info('SEPA scheduler started - fees will refresh every 24 hours')
}

function stopScheduler(
  deps: ServiceDependencies,
  intervalId: NodeJS.Timeout | undefined
): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = undefined
    deps.logger.info('SEPA scheduler stopped')
  } else {
    deps.logger.warn('SEPA scheduler is not running')
  }
}
