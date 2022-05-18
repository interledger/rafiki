import assert from 'assert'
import Ajv2020, { ErrorObject } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import Koa from 'koa'
import OpenAPIDefaultSetter from 'openapi-default-setter'
import OpenapiRequestCoercer from 'openapi-request-coercer'
import OpenAPIRequestValidator from 'openapi-request-validator'
import OpenAPIResponseValidator, {
  OpenAPIResponseValidatorError
} from 'openapi-response-validator'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'

import { HttpMethod } from './'
import { AppContext } from '../app'

interface RequestOptions {
  path: OpenAPIV3_1.PathItemObject
  method: HttpMethod
}

const ajv = new Ajv2020()
addFormats(ajv)

export function createValidatorMiddleware<T extends Koa.Context>({
  path,
  method
}: RequestOptions): (
  ctx: AppContext,
  next: () => Promise<unknown>
) => Promise<void> {
  assert.ok(path[method])

  const queryParams = path[method]?.parameters as OpenAPIV3_1.ParameterObject[]
  const coercer =
    queryParams &&
    new OpenapiRequestCoercer({
      parameters: queryParams
    })
  const defaultSetter =
    queryParams &&
    new OpenAPIDefaultSetter({
      parameters: queryParams
    })

  const parameters = queryParams || []
  if (path.parameters) {
    parameters.push(...(path.parameters as OpenAPIV3_1.ParameterObject[]))
  }
  const requestValidator = new OpenAPIRequestValidator({
    parameters,
    // OpenAPIRequestValidator hasn't been updated with OpenAPIV3_1 types
    requestBody: path[method]?.requestBody as OpenAPIV3.RequestBodyObject,
    errorTransformer,
    customFormats: {
      uint64: function (input) {
        try {
          const value = BigInt(input)
          return value >= BigInt(0)
        } catch (e) {
          return false
        }
      }
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validateRequest = (ctx: any): ctx is T => {
    ctx.assert(ctx.accepts('application/json'), 406, 'must accept json')
    if (coercer) {
      coercer.coerce(ctx.request.query)
    }
    if (defaultSetter) {
      defaultSetter.handle(ctx.request)
    }
    // Path params are validated on the request
    ctx.request.params = ctx.params
    const errors = requestValidator.validateRequest(ctx.request)
    if (errors) {
      ctx.throw(errors.status, errors.errors[0])
    }
    return true
  }

  const responses = path[method]?.responses
  assert.ok(responses)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let validateResponse: ((ctx: any) => ctx is T) | undefined
  if (process.env.NODE_ENV !== 'production') {
    const responseValidator = new OpenAPIResponseValidator({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: OpenAPIResponseValidator supports v3 responses but its types aren't updated
      responses,
      errorTransformer
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateResponse = (ctx: any): ctx is T => {
      if (process.env.NODE_ENV !== 'production') {
        const errors = responseValidator.validateResponse(
          ctx.status,
          ctx.response.body
        )
        if (errors) {
          ctx.throw(500, errors.errors[0])
        }
      }
      return true
    }
  }

  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    if (validateRequest(ctx)) {
      await next()
      if (validateResponse && !validateResponse(ctx)) {
        throw new Error('unreachable')
      }
    } else {
      throw new Error('unreachable')
    }
  }
}

const errorTransformer = (
  _openapiError: OpenAPIResponseValidatorError,
  ajvError: ErrorObject
) => {
  // Remove preceding 'data/'
  // Delineate subfields with '.'
  const message = ajv.errorsText([ajvError]).slice(5).replace(/\//g, '.')
  const additionalProperty =
    ajvError.keyword === 'additionalProperties'
      ? `: ${ajvError.params.additionalProperty}`
      : ''
  return {
    message: message + additionalProperty
  }
}
