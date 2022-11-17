# Welcome to Remix!

- [Remix Docs](https://remix.run/docs)

## Development

From your terminal:

```sh
npm run dev
```

This starts your app in development mode, rebuilding assets on file changes.

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying node applications, the built-in Remix app
server is production-ready.

Make sure to deploy the output of `remix build`

- `build/`
- `public/build/`

### Using a Template

When you ran `npx create-remix@latest` there were a few choices for hosting. You
can run that again to create a new project, then copy over your `app/` folder to
the new project that's pre-configured for your target server.

```sh
cd ..
# create a new project, and pick a pre-configured host
npx create-remix@latest
cd my-new-remix-app
# remove the new project's app (not the old one!)
rm -rf app
# copy your app over
cp -R ../my-old-remix-app/app app
```

# Mock Account Provider

## Seed file

The default [seed file](./seed.yml) contains the seed data for the demo rafiki
configuration.

Make sure the demo stack is running and not previously seeded.

Build the code locally with `pnpm build`. Run it with `pnpm run`. To use a
different config file, set the `SEED_FILE_LOCATION` environment variable, e.g.
`SEED_FILE_LOCATION=<path to seed file> pnpm run`

# Mock Identity Provider

## "Shoe Shop" Demo

The mock identity provider can be used to test the grant authorization flow
using an example "Shoe Shop" site which requests the user's consent to make a
purchase and renders a simple screen showing the result.

**NOTE**: The auth server only uses the mock identity provider for `outgoing-payments` grants.

The demo works as follows:

1. Run
   `pnpm localenv up`
   in the project root
2. Initiate a grant at the auth server instance using its `POST /` route. An example of such a request might look like the following:
```
curl -X POST http://localhost:3006/ -H 'Content-Type: application/json' -d '{"access_token":{"access":[{"type":"outgoing-payment","actions":["create","read","read-all","list"],"identifier":"https://example.com","limits":{"receiver":"https://openpayments.guide/alice/incoming-payments/08394f02-7b7b-45e2-b645-51d04e7c330c","sendAmount":{"value":"500","assetScale":2,"assetCode":"USD"},"receiveAmount":{"value":"500","assetScale":2,"assetCode":"USD"},"interval":"R11/2022-08-24T14:15:22Z/P1M"}}]},"client":{"display":{"name":"Test Client","uri":"https://example.com"},"key":{"jwk":{"kty":"OKP","alg":"EdDSA","crv":"Ed25519","key_ops":["sign","verify"],"use":"sig","kid":"http://fynbos/keys/1234","x":"mbD1mlEyBABhYfUQbhuqNwOwcb4cLcdRoAWIoUWgsL4"},"proof":"httpsig"}},"interact":{"start":["redirect"],"finish":{"method":"redirect","uri":"http://localhost:3030/mock-idp/fake-client","nonce":"1234"}}}'
```
3. In a browser, navigate to the `redirectUrl` provided in the response from the auth server for the above request.
4. The consent screen will present the send amount, receive amount, and receiver
   name, and ask the user for consent to complete the transaction
5. After making a consent choice, the user will be redirected to a page at the
   Shoe Shop which displays the choice that was made, as well as the Grant ID
   and Interaction Reference

## Using a pre-seeded grant
If you wish to use the mock account provider without using the auth server to generate a grant first, follow these steps to use a seeded one instead:
1. In the `auth` directory, run `pnpm knex "seed:run" "--env=development"`
   - The seeded grant has the following properties:
     - `interactid`: `demo-interact-id`
     - `nonce`: `demo-interact-nonce`
     - `returnUrl`: `http%3A%2F%2Flocalhost%3A3300%2Fshoe-shop%3F`
  - if you omit the query parameters, you will first be directed to a page
   allowing you to input the `interactId`, `nonce`, and `returnUrl`
2. Use the following URI to initiate the grant interaction using the seed grant:
```
http://localhost:3006/interact/demo-interact-id/demo-interact-nonce
```

# TODOs:
- Add signature headers to example request in step 2 of "Shoe Shop" Demo once they are working
- Replace client display info uri with shoe shop site that was used in the demo