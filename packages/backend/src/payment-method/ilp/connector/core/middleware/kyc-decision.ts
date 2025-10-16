import { Errors } from 'ilp-packet'
import { ILPContext, ILPMiddleware } from '../rafiki'
import { StreamState } from './stream-address'

export function createKycDecisionMiddleware(): ILPMiddleware {
  return async (
    ctx: ILPContext<StreamState>,
    next: () => Promise<void>
  ): Promise<void> => {
    const { config, logger, redis } = ctx.services

    // TODO This might not be needed? We should be able to just check the state.hasAdditionalData
    if (!config.enableKycAseDecision) {
      await next()
      return
    }

    if (!ctx.state.streamDestination || !ctx.state.hasAdditionalData) {
      await next()
      return
    }

    const incomingPaymentId = ctx.state.streamDestination
    // TODO Maybe we should have a more `unique` key?
    const cacheKey = `kyc_decision:${incomingPaymentId}`

    // Bounded polling: wait for decision up to (packet expiry - safetyMs) or maxWaitMs
    const safetyMs = Number.isFinite(config.kycDecisionSafetyMarginMs)
      ? config.kycDecisionSafetyMarginMs
      : 100
    const maxWaitMs = Number.isFinite(config.kycDecisionMaxWaitMs)
      ? config.kycDecisionMaxWaitMs
      : 1500

    const expiresAt = ctx.request.prepare.expiresAt
    const now = Date.now()
    const timeRemaining = Math.max(0, expiresAt.getTime() - now - safetyMs)
    const deadline = now + Math.min(timeRemaining, maxWaitMs)
    const pollIntervalMs = 50

    const readDecision = async (): Promise<string | undefined> => {
      try {
        const value = await redis.get(cacheKey)
        return value ?? undefined
      } catch (e) {
        logger.warn({ e, incomingPaymentId }, 'decision read failed')
        return
      }
    }

    let decision = await readDecision()
    while (!decision && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs))
      decision = await readDecision()
    }

    if (!decision) {
      await next()
      return
    }

    if (decision === 'allow') {
      await next()
      return
    }

    let reason = 'rejected'
    try {
      const parsed = JSON.parse(decision)
      reason = parsed?.reason || reason
    } catch (_e) {
      reason = decision
    }

    ctx.response.reject = {
      code: Errors.codes.F99_APPLICATION_ERROR,
      triggeredBy: ctx.services.config.ilpAddress,
      message: reason,
      data: Buffer.from(
        JSON.stringify({ reason, incomingPaymentId }),
        'utf8'
      )
    }
  }
}


