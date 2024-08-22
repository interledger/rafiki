# Rafiki Admin

## Setup

Rafiki Admin functions as an interface to the Rafiki backend service and relies on the [Ory Kratos](https://www.ory.sh/docs/kratos/ory-kratos-intro) identity and user management solution, and an SMTP mail server for sending account recovery emails. It doesn’t operate independently; all actions performed in the Rafiki Admin interface, such as fetching data or executing commands, are passed to the Rafiki `backend` service.

Ory Kratos, a secure and open-source identity and user management solution, handles authentication (login) and user management (account creation and password recovery). Check it out on [GitHub](https://github.com/ory/kratos). For an example of how to get these services up and running, see our [local environment](../../localenv/cloud-nine-wallet/docker-compose.yml) setup. TLDR: to get the whole environment up, run the command `pnpm localenv:compose up` from the root of the project. Once all the Docker containers are up, you can interact with Rafiki Admin either through the local Cloud Nine Wallet instance at http://localhost:3010, or through the Happy Life Bank instance at http://localhost:4010.

> **Note: Ory Kratos and Rafiki Admin must be hosted on the same top-level domain. Hosting Kratos on a subdomain is generally not recommended by Ory, but if you choose this approach, ensure you follow the guidelines provided in the Kratos documentation.**

### Login and account management

Access to Rafiki Admin is restricted to ensure that only authorized users can register. This is achieved by using an invitation-only system, where new users are invited by an administrator. The registration flow is not public, so users cannot sign up on their own. Instead, administrators create accounts using the `invite-user` script.

An administrator (someone with backend interface system access) can run the invite-user script in one of two ways, either from outside the container, on the host machine where Docker is running, `docker exec -it <admin-container-name> npm run invite-user -- example@mail.com`, or directly inside the Rafiki Admin Docker container `npm run invite-user -- example@mail.com`.

After running the invite-user script, it generates a recovery link that also serves as an invitation link. This link is output to the terminal, and the administrator can send it to the user. When the user opens the link in their browser, they are automatically logged in and taken to the account settings page, where they can set a new password. Afterward, they can log in normally via the Rafiki Admin URL.

> **Note**: The invitation link is single-use for security purposes. Once accessed, it becomes invalid. If sending the link through Slack, ensure you format it as code by placing it inside backticks (\`) to prevent Slack from automatically previewing the link, which would invalidate it. Example: \``http://localhost:4433/self-service/recovery?flow=116250ee-07bd-4b5c-a98e-87406192bb4b&token=miv0yZ7DFKKw8RyBBQvWoOsTRa2TVuZm`\`.

There is an automated account recovery flow which is triggered by clicking "Forgot pasword?" on the login page. This functionality requires an SMTP mail server for sending recovery links to users. Alternatively, an administrator may generate a recovery link using the same `invite-user` script.

To remove a user, administrators can use the following script: `docker exec -it <admin-container-name> npm run delete-user -- example@mail.com`.

### Why Ory Kratos?

We chose Kratos for its open-source nature, lightweight design, and robust security features. It eliminates the need to manage password hashing, storage, or account recovery flows ourselves, allowing us to focus on what we do best. Kratos also enhances security with features like built-in breach detection, secure session management, and regular security updates.

## Development

You can get a local development environment up by running the command `pnpm localenv:compose up` from the root of the project. Once all the Docker containers are up, you can interact with Rafiki Admin either through the local Cloud Nine Wallet instance at http://localhost:3010, or through the Happy Life Bank instance at http://localhost:4010.. For more information see the local environment [README](../../localenv/README).

We've made development smoother by attaching our Docker containers to the current code with a bind mount. This allows for live development changes with a simple page refresh while running locally. This is not suitable for production setups.

Ory Kratos provides frontend components (such as forms and buttons) for identity management flows like login, and account settings. These components are not fixed in design; they are fetched via API calls based on the specific flow (e.g., login, recovery). Kratos then returns the necessary UI elements, which you can organize, place, and style within the Rafiki Admin interface. This flexibility allows you to match the identity management components with Rafiki Admin's overall look and feel.

Kratos uses the [identity schema](./kratos/config/identity.schema.json) to determine which fields (like email, password, etc.) are required for each flow. This schema dictates the structure and content of the forms and other UI components that Kratos provides.

Rafiki Admin is built with Remix, which integrates client and server-side operations seamlessly. Remix's architecture allows us to manage authentication securely on the server side, minimizing the risk of exposing sensitive logic to client-side vulnerabilities. This approach ensures that loaders check Kratos sessions for user login states before any data is sent to the client, providing a robust security framework.

In Remix, the architecture does not include middleware in the traditional sense where you can centrally handle requests before they reach route-specific logic. Instead, Remix provides loaders and actions on each route to handle fetching data and processing requests, respectively. This decentralized approach means that checking for authentication and managing session or user state needs to be handled explicitly within each loader. If authentication logic is only handled in root.tsx, client-side navigation may not re-run the root.tsx loader logic fully if not explicitly designed to do so. This can lead to situations where client-side navigations do not properly re-check authentication states, depending on how data is cached or passed around in the application.

To add a new typed Apollo request, you will need to add an untyped request and regenerate the GraphQL types. This will generate new types tailored to the specific request being made. The generated type will reflect the request's query or mutation name, variables used, and requested fields.

## Structure

```
📦frontend
 ┣ 📂app
 ┃ ┣ 📂components
 ┃ ┃ ┣ 📂ui
 ┃ ┣ 📂generated
 ┃ ┣ 📂lib
 ┃ ┃ ┣ 📂api
 ┃ ┣ 📂routes
 ┃ ┣ 📂shared
 ┃ ┣ 📂styles
 ┣ 📂kratos
 ┃ ┣ 📂config
 ┃ ┣ 📂scripts
 ┣ 📂public
```

- `app`: source of the application
  - `components`: domain-related components
    - `ui`: reusable code blocks and components that comprise the UI/design system
  - `generated`: types generated by GraphQL Code Gen
  - `lib`: business logic
    - `api`: GraphQL queries and mutations
  - `routes`: outer layer of the application
  - `shared`: utilility functions or types
  - `styles`: CSS files
  - `utils`: serverside utilities
- `kratos`: Dockerfile and setup files
  - `config`: contains the Kratos identity schema
  - `scripts`: scripts to start Kratos, as well as to add and delete users
- `public`: static files and assets that are served to the browser
