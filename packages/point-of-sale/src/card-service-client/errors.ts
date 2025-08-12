import { HttpStatusCode } from 'axios'

export class CardServiceClientError extends Error {
  constructor(
    message: string,
    public status: HttpStatusCode
  ) {
    super(message)
    this.status = status
  }
}
