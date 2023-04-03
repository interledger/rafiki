# Token Introspection

This package supports [GNAP](https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol) [token introspection](https://datatracker.ietf.org/doc/html/draft-ietf-gnap-resource-servers#section-3.3) requests from a **resource server** to an **authorization server**.

It includes:

- Exported TypeScript types generated from a GNAP token introspection OpenAPI specification  
  The OpenAPI specification utilizes schemas from the [Open Payments](../../docs/glossary.md#open-payments) [authorization server OpenAPI specification](https://github.com/interledger/open-payments/blob/main/openapi/auth-server.yaml)
- A NodeJS client for sending token introspection requests

## Usage

Create a token inspection client with the authorization server's url for serving token introspection requests.

```ts
import { createClient } from 'token-introspection'

const client = await createClient({
  logger: customLoggerInstance, // optional, defaults to pino logger
  url: AS_INTROSPECTION_URL
})
```

Send token introspection requests for authorization tokens used in requests made to the resource server.

```ts
import { isActiveTokenInfo, TokenInfo } from 'token-introspection'

let tokenInfo: TokenInfo

try {
  tokenInfo = await client.introspect({
    access_token: token
  })
} catch (err) {
  ctx.throw(401, 'Invalid Token')
}

if (!isActiveTokenInfo(tokenInfo)) {
  ctx.throw(403, 'Inactive Token')
}
```

Validate that `tokenInfo.access` includes the `types` and `actions` pertaining to the current request to the resource server.
