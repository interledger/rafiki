# Open Payments

[Open Payments](../../docs/open-payments.md) is an API standard that allows third-parties (with the account holder's consent) to initiate payments and to view the transaction history on the account holder's account.

Open Payments consists of two Open API specifications, a **resource server** which exposes APIs for performing functions against the underlying accounts and an **authorisation server** which exposes APIs compliant with the [GNAP](../../docs/glossary.md#grant-negotiation-authorization-protocol) standard for getting grants to access the resource server APIs.

This package provides TypeScript & NodeJS tools for using Open Payments:

- Exported TypeScript types generated directly from the Open Payments Open API specifications
- A NodeJS client to help communicate with the Open Payment APIs, and validate responses against the Open API specifications

## Who is this package for?

Besides this package being used in the Rafiki [`backend`](../backend) and [`auth`](../auth) packages to help with inter-Rafiki Open Payments API calls, this package could be used (and not limited to):

- Merchant wallet services to facilitate eCommerce payments
- Third party services to display an account holder's transaction history

## Installation

You can install the Open Payments package using:

```sh
npm install @interledger/open-payments
```

## Usage

This package exports two clients, an `UnauthenticatedClient` and an `AuthenticatedClient`.

### `UnauthenticatedClient`

This client allows making requests to access publicly available resources, without needing authentication.
The three available resources are [Payment Pointers](https://docs.openpayments.guide/reference/get-payment-pointer), [Payment Pointer Keys](https://docs.openpayments.guide/reference/get-payment-pointer-keys), and [ILP Stream Connections](https://docs.openpayments.guide/reference/get-ilp-stream-connection).

```ts
import { createUnauthenticatedClient } from '@interledger/open-payments'

const client = await createUnauthenticatedClient({
  requestTimeoutMs: 1000, // optional, defaults to 5000
  logger: customLoggerInstance // optional, defaults to pino logger
})

const paymentPointer = await client.paymentPointer.get({
  url: 'https://cloud-nine-wallet/alice'
})
```

### `AuthenticatedClient`

This client provides methods to make requests to all of the Open Payment APIs. Each request that requires authentication will be signed (using [HTTP signatures](../../docs/architecture.md#http-signature-utils)) with the given private key.

```ts
import { createAuthenticatedClient } from '@interledger/open-payments'

const client = await createAuthenticatedClient({
  keyId: KEY_ID,
  privateKey: PRIVATE_KEY,
  paymentPointerUrl: PAYMENT_POINTER_URL
})
```

In order to create the client, three fields need to be given: `keyId`, the `privateKey` and the `paymentPointerUrl`:

| Variable          | Description                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| paymentPointerUrl | The valid payment pointer with which the client making requests will identify itself. A JSON Web Key Set document, including the public key that the client instance will use to protect requests and any user-facing information about the client instance used in interactions, MUST be available at the `{paymentPointerUrl}/jwks.json` url. |
| privateKey        | The the private EdDSA-Ed25519 key used to sign the authenticated requests. As mentioned above, the public JWKS document of this key MUST be available at the `{paymentPointerUrl}/jwks.json` url.                                                                                                                                               |
| keyId             | The key identifier of the given private key and the corresponding public JWKS document.                                                                                                                                                                                                                                                         |

> **Note**
> To simplify key provisioning and JWK generation, you can use the `parseOrProvisionKey` and `generateJwk` methods from the [`http-signature-utils`](../http-signature-utils/README.md#usage) pacakge.

## Example
