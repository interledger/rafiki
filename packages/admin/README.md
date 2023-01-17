# Rafiki Admin UI

## Development

This project assumes that you have a local Rafiki backend instance up and running. See the Environment Setup and Local Development sections in the main [README](../../README.md).

This project is using Node version 19.

To start the project in development mode:

```sh
npm run dev
```

This starts your app in development mode, rebuilding assets on file changes. You can access your app on [http://localhost:3005](http://localhost:3005).


Currently you need to also manually build your CSS assets:
```sh
npm run scss
```

To format and lint code:
```sh
npm run format
```

Types are generated automatically for this project and stored in the `generated` folder. They are generated using CodeGen which is configured as part of the Rafiki backend.
