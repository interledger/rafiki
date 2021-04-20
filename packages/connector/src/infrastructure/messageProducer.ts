import { Message } from '../messages/message'

export interface MessageProducer {
  send(message: Message): Promise<unknown>
}
