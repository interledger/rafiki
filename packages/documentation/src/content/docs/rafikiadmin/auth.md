---
title: Rafiki Admin Auth
---

## Setup

Rafiki Admin functions as an interface to the Rafiki backend service and relies on the [Ory Kratos](https://www.ory.sh/docs/kratos/ory-kratos-intro) identity and user management solution. It doesn’t operate independently; all actions performed in the Rafiki Admin interface, such as fetching data or executing commands, are passed to the Rafiki `backend` service.

Ory Kratos, a secure and open-source identity and user management solution, handles authentication (login) and user management (account creation and password recovery). Check it out on [GitHub](https://github.com/ory/kratos). For an example of how to get these services up and running, see our [local environment](/integration/playground/overview) setup.

> **Note: Ory Kratos and Rafiki Admin must be hosted on the same top-level domain. Hosting Kratos on a subdomain is generally not recommended by Ory, but if you choose this approach, ensure you follow the guidelines provided in the Kratos documentation.**

## Login and account management

Access to Rafiki Admin is restricted to ensure that only authorized users can register. This is achieved by using an invitation-only system, where new users are invited by an administrator. The registration flow is not public, so users cannot sign up on their own. Instead, administrators create accounts using the `invite-user` script.

An administrator (someone with backend interface system access) can run the invite-user script in one of two ways, either from outside the container, on the host machine where Docker is running, `docker exec -it <admin-container-name> npm run invite-user -- example@mail.com`, or directly inside the Rafiki Admin Docker container `npm run invite-user -- example@mail.com`.

After running the invite-user script, it generates a recovery link that also serves as an invitation link. This link is output to the terminal, and the administrator can send it to the user. When the user opens the link in their browser, they are automatically logged in and taken to the account settings page, where they can set a new password. Afterward, they can log in normally via the Rafiki Admin URL.

![Rafiki account settings screen](/img/rafiki-auth.png)

> **Note**: The invitation link is single-use for security purposes. Once accessed, it becomes invalid. If sending the link through Slack, ensure you format it as code by placing it inside backticks (\`) to prevent Slack from automatically previewing the link, which would invalidate it. Example: \``http://localhost:4433/self-service/recovery?flow=116250ee-07bd-4b5c-a98e-87406192bb4b&token=miv0yZ7DFKKw8RyBBQvWoOsTRa2TVuZm`\`.

There is an automated account recovery flow which requires an SMTP mail server for sending recovery links to users. Alternatively, an administrator may generate a recovery link using the same `invite-user` script.

To remove a user, administrators can use the following script: `docker exec -it <admin-container-name> npm run delete-user -- example@mail.com`.

## Why Ory Kratos?

We chose Kratos for its open-source nature, lightweight design, and robust security features. It eliminates the need to manage password hashing, storage, or account recovery flows ourselves, allowing us to focus on what we do best.

Kratos also enhances security with features like built-in breach detection, secure session management, and regular security updates.

Ory Kratos provides frontend components (such as forms and buttons) for identity management flows like login, and account settings. These components are not fixed in design; they are fetched via API calls which allows us to match the identity management components with Rafiki Admin's overall look and feel.
