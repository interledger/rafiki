import { Deferred } from '../utils/deferred'
import { WebhookBody } from './routes'

class WebhookWaitMap<T, U> extends Map {
  setWithExpiry(key: T, value: U, timeout: number) {
    super.set(key, value)
    this.setExpiry(key, timeout)
    return this
  }

  setExpiry(key: T, timeout: number) {
    setTimeout(() => {
      this.delete(key)
    }, timeout)
  }
}

export const webhookWaitMap = new WebhookWaitMap<
  string,
  Deferred<WebhookBody>
>()
