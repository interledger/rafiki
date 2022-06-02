// Mock 'openapi-schema-validator' to allow 'jest-openapi'
// to work with version 3.1 OpenAPI specs.

import { ErrorObject } from 'ajv'
import { OpenAPI } from 'openapi-types'

export interface IOpenAPISchemaValidator {
  /**
   * Validate the provided OpenAPI doc against this validator's schema version and
   * return the results.
   */
  validate(doc: OpenAPI.Document): OpenAPISchemaValidatorResult
}

export interface OpenAPISchemaValidatorResult {
  errors: ErrorObject[]
}

export default class OpenAPISchemaValidator implements IOpenAPISchemaValidator {
  public validate(_openapiDoc: OpenAPI.Document): OpenAPISchemaValidatorResult {
    return { errors: [] }
  }
}
