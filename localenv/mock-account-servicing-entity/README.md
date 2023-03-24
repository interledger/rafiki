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

# Mock Account Servicing Entity

## Seed file

The default [seed file](./seed.yml) contains the seed data for the demo rafiki
configuration.

Make sure the demo stack is running and not previously seeded.

Build the code locally with `pnpm build`. Run it with `pnpm run`. To use a
different config file, set the `SEED_FILE_LOCATION` environment variable, e.g.
`SEED_FILE_LOCATION=<path to seed file> pnpm run`
