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

type Response<T> = Omit<AppContext['response'], 'body'> & {
  body: T
}

type ResponseContext<T> = Omit<AppContext, 'response'> & {
  body: T
  response: Response<T>
}

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
  const validate = (ctx: any): ctx is T => {
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
  return async (
    ctx: AppContext,
    next: () => Promise<unknown>
  ): Promise<void> => {
    if (validate(ctx)) {
      await next()
    } else {
      throw new Error('unreachable')
    }
  }
}

export function createResponseValidator<T>({
  path,
  method
}: // eslint-disable-next-line @typescript-eslint/no-explicit-any
RequestOptions): (ctx: any) => ctx is ResponseContext<T> {
  const responses = path[method]?.responses
  assert.ok(responses)
  const responseValidator = new OpenAPIResponseValidator({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: OpenAPIResponseValidator supports v3 responses but its types aren't updated
    responses,
    errorTransformer
  })

  const code = Object.keys(responses).find((code) => code.startsWith('20'))
  assert.ok(code)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ctx: any): ctx is ResponseContext<T> => {
    assert.equal(
      ctx.response.get('Content-Type'),
      'application/json; charset=utf-8'
    )
    const errors = responseValidator.validateResponse(code, ctx.response.body)
    if (errors) {
      throw errors.errors[0]
    }
    return true
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
