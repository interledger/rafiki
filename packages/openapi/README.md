# OpenAPI 3.1 Validator

This package exposes functionality to validate requests and responses according to a given OpenAPI 3.1 schema.

## Local Development

### Building

```shell
pnpm --filter openapi build
```

### Testing

From the monorepo root directory:

```shell
pnpm --filter openapi test
```

## Usage

First, instantiate an `OpenAPI` validator object with a reference to your OpenAPI spec:

```ts
const openApi = await createOpenAPI(OPEN_API_URL)
```

Then, responses and requests validators can be created and used as such:

```ts
const validateRequest = openApi.createRequestValidator({
  path: '/resource/{id}',
  method: HttpMethod.GET
})

validateRequest(data) // true or false

const validateResponse = openApi.createResponseValidator({
  path: '/resource/{id}',
  method: HttpMethod.GET
})

validateResponse(data) // true or false
```

> **Note**
> The underlying response & request validator [packages](https://github.com/kogosoftwarellc/open-api/tree/master/packages) use the [Ajv schema validator](https://ajv.js.org) library. When a request and a validator is created, a `new Ajv()` instance is also created. However, Avj [recommends](https://ajv.js.org/guide/managing-schemas.html#compiling-during-initialization) instantiating once at initialization. This means validators (`openApi.createRequestValidator` and `openApi.createResponseValidator`) should also be instantiated once during the lifecycle of the applcation to avoid any issues.

Likewise, you can validate both requests and responses in a middleware, using the `createValidatorMiddleware` method:

```ts
const openApi = await createOpenAPI(OPEN_API_URL)
const router = new SomeRouter()
router.get(
    '/example',
    createValidatorMiddleware(openApi, {
    path: '/example',
    method: HttpMethod.GET
})
```
