import { Deferred } from '../utils/deferred'
import { PaymentResult } from './types'

export const paymentWaitMap = new Map<string, Deferred<PaymentResult>>()
