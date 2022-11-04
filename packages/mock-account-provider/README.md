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

The mock identity provider can be used to test the grant authorization flow using an example "Shoe Shop" site which requests the user's consent to make a purchase and renders a simple screen showing the result.

**NOTE**: The mock identity provider currently only supports the `outgoing-payment` case

The demo works as follows:

1. Create the grant using the necessary `auth` APIs, or use the pre-seeded `demo` grant:
    - `interactid`: `demo-interact-id`
    - `nonce`: `demo-interact-nonce`
    - `returnUrl`: `http%3A%2F%2Flocalhost%3A3300%2Fshoe-shop%3F`
2. In a browser, navigate to the mock consent screen page at `http://localhost:3300/consent-screen?interactid=<interactid>&nonce=<nonce>&returnUrl=<returnUrl>
    - for the `demo` grant, the URL would be
        - (http://localhost:3300/consent-screen?interactid=demo-interact-id&nonce=demo-interact-nonce&returnUrl=http%3A%2F%2Flocalhost%3A3300%2Fshoe-shop%3F)
    - if you omit the query parameters, you will first be directed to a page allowing you to input the `interactId`, `nonce`, and `returnUrl`
3. The consent screen will present the send amount, receive amount, and receiver name, and ask the user for consent to complete the transaction
4. After making a consent choice, the user will be redirected to a page at the Shoe Shop which displays the choice that was made, as well as the Grant ID and Interaction Reference
