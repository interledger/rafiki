import $RefParser from '@apidevtools/json-schema-ref-parser'
import assert from 'assert'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'

export const HttpMethod = {
  ...OpenAPIV3.HttpMethods
}
export type HttpMethod = OpenAPIV3.HttpMethods

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

export interface OpenAPI {
  paths: Paths
}

class OpenAPIImpl implements OpenAPI {
  constructor(spec: OpenAPIV3_1.Document) {
    assert.ok(spec.paths)
    this.paths = spec.paths as Paths
  }
  public paths: Paths
}
