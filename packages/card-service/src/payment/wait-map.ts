import { Deferred } from '../utils/deferred'
import { PaymentEventBody } from './types'

export const paymentWaitMap = new Map<string, Deferred<PaymentEventBody>>()
