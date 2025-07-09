import { AxiosInstance } from 'axios'
import { Logger } from 'pino'

const PAYMENT_FOUNDED_PATH = '/payment-event'

type EventDetails = {
  requestId: string
  outgoingPaymentId: string
  resultCode: string
}

export interface CardService {
  sendPaymentEvent(eventDetails: EventDetails): Promise<void>
}

interface ServiceDependencies {
  axios: AxiosInstance
  cardServiceHost: string
  logger: Logger
}

export async function createCardService(
  deps_: ServiceDependencies
): Promise<CardService> {
  const logger = deps_.logger.child({
    service: 'CardService'
  })
  const deps = {
    ...deps_,
    logger
  }

  return {
    sendPaymentEvent: (eventDetails: EventDetails) =>
      sendPaymentEvent(deps, eventDetails)
  }
}

async function sendPaymentEvent(
  deps: ServiceDependencies,
  eventDetails: EventDetails
) {
  const { status } = await deps.axios.post(
    `${deps.cardServiceHost}${PAYMENT_FOUNDED_PATH}`,
    eventDetails
  )

  if (status !== 200) {
    deps.logger.error({ status, eventDetails }, 'Failed to send payment event')
    throw new Error(
      `Failed to send payment event with details ${JSON.stringify(eventDetails)}`
    )
  }
}
