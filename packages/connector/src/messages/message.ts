export interface Message {
  name: string
  task: string
  payload: unknown
  formatPayload: () => unknown
}
