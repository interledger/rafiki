import { OpenAPI, RequestOptions } from './'
import { AppContext } from '../app'

export function createValidatorMiddleware<T extends AppContext>(
  spec: OpenAPI,
  options: RequestOptions
): (ctx: AppContext, next: () => Promise<unknown>) => Promise<void> {
  const validateRequest = spec.createRequestValidator<T['request']>(options)
  const validateResponse =
    process.env.NODE_ENV !== 'production' &&
    spec.createResponseValidator(options)

  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    ctx.assert(ctx.accepts('application/json'), 406, 'must accept json')
    try {
      if (validateRequest(ctx.request)) {
        await next()
        if (validateResponse && !validateResponse(ctx.response)) {
          throw new Error('unreachable')
        }
      } else {
        throw new Error('unreachable')
      }
    } catch (err) {
      ctx.throw(err.status || 500, err.errors?.[0])
    }
  }
}
