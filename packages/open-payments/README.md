# Open Payments

[Open Payments](../../docs/open-payments.md) is an API standard that allows third-parties (with the account holder's consent) to initiate payments and to view the transaction history on the account holder's account.

Open Payments consists of two OpenAPI specifications, a **resource server** which exposes APIs for performing functions against the underlying accounts and an **authorization server** which exposes APIs compliant with the [GNAP](../../docs/glossary.md#grant-negotiation-authorization-protocol) standard for getting grants to access the resource server APIs.

This package provides TypeScript & NodeJS tools for using Open Payments:

- Exported TypeScript types generated directly from the Open Payments Open API specifications
- A NodeJS client that exposes Open Payment APIs:
  - Signs requests with provided key
  - Validates responses against Open API specs

## Who is this package for?

This package could be used by (but not limited to):

- eCommerce backend services to facilitate payments between their wallet and a customer's wallet (example below)
- An app to display an account holder's transaction history
- Digital wallets looking to support peer-to-peer payments between Open Payment enabled wallets

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

An `AuthenticatedClient` provides all of the methods that `UnauthenticatedClient` does, as well as the rest of the Open Payment APIs (both the authorizaton and resource specs). Each request requiring authentication will be signed (using [HTTP signatures](../../docs/architecture.md#http-signature-utils)) with the given private key.

```ts
import { createAuthenticatedClient } from '@interledger/open-payments'

const client = await createAuthenticatedClient({
  keyId: KEY_ID,
  privateKey: PRIVATE_KEY,
  paymentPointerUrl: PAYMENT_POINTER_URL
})
```

In order to create the client, three properties need to be provided: `keyId`, the `privateKey` and the `paymentPointerUrl`:

| Variable            | Description                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `paymentPointerUrl` | The valid payment pointer with which the client making requests will identify itself. This will be used as the `client` field during [Grant Creation](https://docs.openpayments.guide/reference/post-request). Additionally, a JSON Web Key Set document, including the public key that the client instance will use to protect requests MUST be available at the `{paymentPointerUrl}/jwks.json` url. |
| `privateKey`        | The the private EdDSA-Ed25519 key bound to the payment pointer, and used to sign the authenticated requests with. As mentioned above, the public JWK document of this key MUST be available at the `{paymentPointerUrl}/jwks.json` url.                                                                                                                                                                |
| `keyId`             | The key identifier of the given private key and the corresponding public JWK document.                                                                                                                                                                                                                                                                                                                 |

> **Note**
>
> To simplify EdDSA-Ed25519 key provisioning and JWK generation, you can use the `parseOrProvisionKey` and `generateJwk` methods from the [`http-signature-utils`](../http-signature-utils/README.md#usage) package.

## Example

As mentioned previously, Open Payments APIs can facilitate a payment between two parties.

For example, say Alice wants to purchase a $50 product from a merchant called Shoe Shop. If both parties have Open Payments enabled wallets, where Alice's payment pointer is `https://cloud-nine-wallet/alice`, and Shoe Shop's is `https://happy-life-bank/shoe-shop`, requests during checkout from Shoe Shop's backend would look like this with the client:

1. Create an Open Payments client

In this case, since Shoe Shop wants to make requests that require authorization, Shoe Shop's backend will need to create an `AuthenticatedClient`:

```ts
import { createAuthenticatedClient } from '@interledger/open-payments'

const client = await createAuthenticatedClient({
  paymentPointerUrl: 'https://happy-life-bank/shoe-shop',
  keyId: KEY_ID,
  privateKey: PRIVATE_KEY
  // The public JWK with this key (and keyId) would be available at https://happy-life-bank/shoe-shop/jwks.json
})
```

2.  Get `PaymentPointers`

Grab the payment pointers of the parties:

```ts
const shoeShopPaymentPointer = await client.paymentPointer.get({
  url: 'https://happy-life-bank/shoe-shop'
})

const customerPaymentPointer = await client.paymentPointer.get({
  url: 'https://cloud-nine-wallet/alice'
})
```

3. Create `IncomingPayment`

Shoe Shop's backend gets a grant (if it doesn't have one already) to create an `IncomingPayment` on its wallet:

```ts
const incomingPaymentGrant = await client.grant.request(
  { url: shoeShopPaymentPointer.authServer },
  {
    access_token: {
      access: [
        {
          type: 'incoming-payment',
          actions: ['read-all', 'create']
        }
      ]
    }
  }
)

const incomingPayment = await client.incomingPayment.create(
  {
    paymentPointer: shoeShopPaymentPointer.authServer,
    accessToken: incomingPaymentGrant.access_token.value
  },
  {
    incomingAmount: {
      assetCode: 'USD',
      assetScale: 2,
      value: '5000'
    },
    description: 'Purchase at Shoe Shop',
    externalRef: '#INV2022-8363828'
  }
)
```

4. Create `Quote`

Then, it'll get a grant to create a `Quote` on Alice's payment pointer, which will give the amount it'll cost Alice to make the payment (with the ILP fees + her wallet's fees)

```ts
const quoteGrant = await client.grant.request(
  { url: alicePaymentPointer.authServer },
  {
    access_token: {
      access: [
        {
          type: 'quote',
          actions: ['create', 'read']
        }
      ]
    }
  }
)

const quote = await client.quote.create(
  {
    paymentPointer: customerPaymentPointer.id,
    accessToken: quoteGrant.access_token.value
  },
  { receiver: incomingPayment.id }
)

// quote.sendAmount.value = '5200'
```

5. Get `OutgoingPayment` grant

The final step for Shoe Shop's backend system will be to create an `OutgoingPayment` on Alice's wallet. Before this, however, Shoe Shop's backend will need to create an outgoing payment grant.

```ts
const pendingOutgoingPaymentGrant = await client.grant.request(
  { url: customerPaymentPointer.authServer },
  {
    access_token: {
      access: [
        {
          type: 'outgoing-payment',
          actions: ['create', 'read'],
          identifier: customerPaymentPointer.id,
          limits: {
            sendAmount: quote.sendAmount // This limit will insure Shoe Shop would only be able to create an OutgoingPayment only as high as the quoted amount
          }
        }
      ]
    },
    interact: {
      start: ['redirect'],
      finish: {
        method: 'redirect',
        uri: 'https://shoe-shop/open-payment/complete', // this is where Alice will be redirected to after she accepts (or rejects) the request to pull money out of her account
        nonce: '456'
      }
    }
  }
)
```

6. Get user confirmation via grant & redirect

Since the `OutgoingPayment` grant is interactive (meaning, Alice needs to consent to Shoe Shop creating an `OutgoingPayment` on her account), Shoe Shop will need to redirect Alice to where the grant points to. Say the open payment request was being processed in an `/open-payment-start` route:

```ts
app.post('/open-payment-start', (req, res) => {
  ...
  res.send({
    redirectUrl: pendingOutgoingPaymentGrant.interact.redirect // e.g. https://cloud-nine-wallet/interact/...
  })
})
```

From there on, the Shoe Shop website can take Alice to a URL (e.g. https://cloud-nine-wallet/interact/../) where she can approve the request for Shoe Shop to create an `OutgoingPayment` on her wallet (i.e. take money out of her account). Once she completes her interaction, she should be redirected to the `interact.finish.uri` url provided in the initial grant request.

7. Continue `OutgoingPayment` grant & create the `OutgoingPayment`

```ts
app.post('/open-payment/complete', (req, res) => {
  const outgoingPaymentGrant = await client.grant.continue(
    { url: pendingOutgoingPaymentGrant.continue.uri },
    { interact_ref: response.interact_ref }
  )

  const outgoingPayment = await client.outgoingPayment.create(
    {
      paymentPointer: alicePaymentPointer.id,
      accessToken: outgoingPaymentGrant.access_token.value
    },
    { quoteId: quote.id, description: 'Your purchase at Shoe Shop' }
  )

  res.send({
    success: true
  })
})
```

At this point, the Shoe Shop can show to Alice that the payment has been completed.
