import $RefParser from '@apidevtools/json-schema-ref-parser'
import Ajv2020, { ErrorObject } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import assert from 'assert'
import OpenAPIDefaultSetter from 'openapi-default-setter'
import OpenapiRequestCoercer from 'openapi-request-coercer'
import OpenAPIRequestValidator from 'openapi-request-validator'
import OpenAPIResponseValidator, {
  OpenAPIResponseValidatorError
} from 'openapi-response-validator'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'

export { createValidatorMiddleware } from './middleware'

export const HttpMethod = {
  ...OpenAPIV3.HttpMethods
}
export type HttpMethod = OpenAPIV3.HttpMethods

const ajv = new Ajv2020()
addFormats(ajv)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isHttpMethod = (o: any): o is HttpMethod =>
  Object.values(HttpMethod).includes(o)

export async function createOpenAPI(spec: string): Promise<OpenAPI> {
  return new OpenAPIImpl(
    (await $RefParser.dereference(spec)) as OpenAPIV3_1.Document
  )
}

// Replace OpenAPIV3_1.PathsObject and its possibly undefined paths:
// export interface PathsObject<T extends {} = {}, P extends {} = {}> {
//   [pattern: string]: (PathItemObject<T> & P) | undefined;
// }
interface Paths<T = unknown, P = unknown> {
  [pattern: string]: OpenAPIV3_1.PathItemObject<T> & P
}

export interface RequestOptions {
  path: string
  method: HttpMethod
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ValidateFunction<T> = (data: any) => data is T

export interface OpenAPI {
  paths: Paths
  createRequestValidator<T>(options: RequestOptions): ValidateFunction<T>
  createResponseValidator<T>(options: RequestOptions): ValidateFunction<T>
}

class OpenAPIImpl implements OpenAPI {
  constructor(spec: OpenAPIV3_1.Document) {
    assert.ok(spec.paths)
    this.paths = spec.paths as Paths
  }
  public paths: Paths

  public createRequestValidator<T>({ path, method }: RequestOptions) {
    const operation = this.paths[path]?.[method]
    assert.ok(operation)

    const queryParams = operation.parameters as OpenAPIV3_1.ParameterObject[]
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
    if (this.paths[path].parameters) {
      parameters.push(
        ...(this.paths[path].parameters as OpenAPIV3_1.ParameterObject[])
      )
    }
    const requestValidator = new OpenAPIRequestValidator({
      parameters,
      // OpenAPIRequestValidator hasn't been updated with OpenAPIV3_1 types
      requestBody: operation.requestBody as OpenAPIV3.RequestBodyObject,
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
    return (request: any): request is T => {
      if (coercer) {
        coercer.coerce(request.query)
      }
      if (defaultSetter) {
        defaultSetter.handle(request)
      }
      const errors = requestValidator.validateRequest(request)
      if (errors) {
        throw errors
      }
      return true
    }
  }

  public createResponseValidator<T>({ path, method }: RequestOptions) {
    const responses = this.paths[path]?.[method]?.responses
    assert.ok(responses)

    const responseValidator = new OpenAPIResponseValidator({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore: OpenAPIResponseValidator supports v3 responses but its types aren't updated
      responses,
      errorTransformer
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (response: any): response is T => {
      const errors = responseValidator.validateResponse(
        response.status,
        response.body
      )
      if (errors) {
        throw errors
      }
      return true
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
