import { Message, MessageProducer } from './messageProducer'
import { WorkerUtils, JobHelpers, Job } from 'graphile-worker'

export class GraphileProducer implements MessageProducer {
  private utils!: WorkerUtils | JobHelpers

  constructor(utils?: WorkerUtils | JobHelpers) {
    if (utils) {
      this.utils = utils
    }
  }

  setUtils(utils: WorkerUtils | JobHelpers): void {
    this.utils = utils
  }

  async send(message: Message): Promise<Job> {
    if (!this.utils) {
      throw new Error('graphile utils not set.')
    }
    this.utils.logger.debug('Adding message onto queue.', { message })
    return this.utils.addJob(message.task, message.formatPayload())
  }
}
