import { Worker, Job } from 'bullmq'
import axios, { isAxiosError } from 'axios'
import { canonicalize } from 'json-canonicalize'
import { createHmac } from 'node:crypto'
import dotenv from 'dotenv'
import pino from 'pino'

dotenv.config()

// Config
const WEBHOOK_QUEUE_NAME = 'webhook'
const redisUrl = process.env.REDIS_URL
const webhookTimeout = parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10) // Default 10 seconds in milliseconds

if (!redisUrl) {
  console.error('REDIS_URL environment variable is required.')
  process.exit(1)
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'error'
})

// Worker
interface WebhookJobData {
  id: string
  type: string
  data: any // TOOD: adjust type
  // Should maybe add as ENV vars here and rm from backend
  targetUrl: string
  signatureSecret: string
  signatureVersion: number
}

const webhookWorker = new Worker<WebhookJobData>(
  WEBHOOK_QUEUE_NAME,
  async (job: Job<WebhookJobData>) => {
    if (job.name !== 'send') {
      throw new Error(`Found unexpected job. name: ${job.name}`)
    }
    const { id, type, data, targetUrl, signatureSecret, signatureVersion } =
      job.data

    const jobLogger = logger.child({ jobId: job.id })

    jobLogger.info(
      { targetUrl, webhookType: type, webhookId: id },
      `Processing webhook event`
    )

    jobLogger.info(
      { targetUrl, webhookType: type, webhookId: id },
      `Processing webhook event`
    )

    const requestHeaders: WebhookHeaders = {
      'Content-Type': 'application/json'
    }

    const body = {
      id,
      type,
      data: data
    }

    if (signatureSecret) {
      requestHeaders['Rafiki-Signature'] = generateWebhookSignature(
        body,
        signatureSecret,
        signatureVersion || 1
      )
    }

    try {
      await axios.post(targetUrl, body, {
        timeout: webhookTimeout,
        headers: requestHeaders,
        validateStatus: (status) => status === 200
      })

      jobLogger.info(
        { targetUrl, webhookType: type, webhookId: id },
        `Webhook event successfully sent`
      )
    } catch (err) {
      if (isAxiosError(err)) {
        const attempts = job.attemptsMade + 1
        const errorMessage = err.message
        jobLogger.warn(
          {
            attempts,
            error: errorMessage,
            statusCode: err.response?.status,
            targetUrl,
            webhookType: type,
            webhookId: id
          },
          `Webhook request failed`
        )
        // throw error to trigger retry based on queue configuration
        throw new Error(
          `Webhook delivery failed (attempt ${attempts}): ${errorMessage}. Status Code: ${err.response?.status || 'N/A'}`
        )
      } else {
        jobLogger.error(
          { error: err, targetUrl, webhookType: type, webhookId: id },
          `Non-Axios error sending webhook`
        )
        throw err
      }
    }
  },
  {
    connection: { url: redisUrl }
    // Configure worker concurrency and retry strategies here if needed
    // concurrency: 10,
    // defaultJobOptions: {
    //   attempts: 5,
    //   backoff: {
    //     type: 'exponential',
    //     delay: 1000 // 1 second initial delay
    //   }
    // }
  }
)

webhookWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, `Job completed successfully`)
})

webhookWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, `Job failed`)
})

webhookWorker.on('error', (err) => {
  logger.error({ error: err }, 'Error in worker:')
})

logger.info(
  { queueName: WEBHOOK_QUEUE_NAME },
  'Webhook worker started, listening to queue'
)

// Utils
type EventPayload = Pick<WebhookJobData, 'id' | 'type' | 'data'>

type WebhookHeaders = {
  'Content-Type': string
  'Rafiki-Signature'?: string
}

function generateWebhookSignature(
  event: EventPayload,
  secret: string,
  version: number
): string {
  const timestamp = Date.now()

  const payload = `${timestamp}.${canonicalize({
    id: event.id,
    type: event.type,
    data: event.data
  })}`
  const hmac = createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return `t=${timestamp}, v${version}=${digest}`
}
