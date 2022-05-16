import assert from 'assert'
import Ajv2020, { ValidateFunction } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import Koa from 'koa'
import OpenAPIDefaultSetter from 'openapi-default-setter'
import OpenapiRequestCoercer from 'openapi-request-coercer'
import { convertParametersToJSONSchema } from 'openapi-jsonschema-parameters'
import { OpenAPIV3_1, IJsonSchema } from 'openapi-types'

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
ajv.addFormat('uint64', (x) => {
  try {
    const value = BigInt(x)
    return value >= BigInt(0)
  } catch (e) {
    return false
  }
})

function getParametersSchema(
  parameters: OpenAPIV3_1.ParameterObject[]
): IJsonSchema[] {
  const schemas = convertParametersToJSONSchema(parameters)
  const allOf: IJsonSchema[] = []
  return ['path', 'query'].reduce((allOf, key) => {
    if (schemas[key]) {
      allOf.push({
        type: 'object',
        ...schemas[key]
      })
    }
    return allOf
  }, allOf)
}

export function createValidatorMiddleware<T extends Koa.Context>({
  path,
  method
}: RequestOptions): (
  ctx: AppContext,
  next: () => Promise<unknown>
) => Promise<void> {
  assert.ok(path[method])

  const validateParams =
    path.parameters &&
    ajv.compile<T['params']>({
      allOf: getParametersSchema(
        path.parameters as OpenAPIV3_1.ParameterObject[]
      )
    })

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
  const validateQuery =
    queryParams &&
    ajv.compile<T['query']>({
      allOf: getParametersSchema(queryParams)
    })

  const bodySchema = (path[method]
    ?.requestBody as OpenAPIV3_1.RequestBodyObject)?.content['application/json']
    .schema
  const validateBody = bodySchema && ajv.compile<T['body']>(bodySchema)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validate = (ctx: any): ctx is T => {
    ctx.assert(ctx.accepts('application/json'), 406, 'must accept json')
    if (validateParams && !validateParams(ctx.params)) {
      ctx.throw(400, getErrorMessage(validateParams))
    }
    if (coercer) {
      coercer.coerce(ctx.request.query)
    }
    if (defaultSetter) {
      defaultSetter.handle(ctx.request)
    }
    if (validateQuery && !validateQuery(ctx.request.query)) {
      ctx.throw(400, getErrorMessage(validateQuery))
    }
    if (validateBody) {
      ctx.assert(
        ctx.get('Content-Type') === 'application/json',
        400,
        'must send json body'
      )

      if (!validateBody(ctx.request.body)) {
        ctx.throw(400, getErrorMessage(validateBody))
      }
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

  const code = Object.keys(responses).find((code) => code.startsWith('20'))
  assert.ok(code)
  const bodySchema = (responses[code] as OpenAPIV3_1.ResponseObject).content?.[
    'application/json'
  ].schema
  assert.ok(bodySchema)
  const validateBody = ajv.compile<T>(bodySchema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ctx: any): ctx is ResponseContext<T> => {
    assert.equal(ctx.status.toString(), code)
    assert.equal(
      ctx.response.get('Content-Type'),
      'application/json; charset=utf-8'
    )
    if (!validateBody(ctx.response.body)) {
      throw getErrorMessage(validateBody)
    }
    return true
  }
}

const getErrorMessage = (validate: ValidateFunction): string => {
  // Remove preceding 'data/'
  // Delineate subfields with '.'
  const message = ajv.errorsText(validate.errors).slice(5).replace('/', '.')
  const additionalProperty =
    validate.errors?.[0].keyword === 'additionalProperties'
      ? `: ${validate.errors?.[0].params.additionalProperty}`
      : ''
  return message + additionalProperty
}
