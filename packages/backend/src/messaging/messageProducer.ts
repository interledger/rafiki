export interface Message {
  name: string
  task: string
  payload: unknown
  formatPayload: () => unknown
}

export interface MessageProducer {
  send(message: Message): Promise<unknown>
}
