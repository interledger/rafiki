---
title: Overview
---

Rafiki Admin provides a user-friendly administrative interface for interacting with the `backend` admin API [mutations](/apis/backend/mutations) and [queries](/apis/backend/queries). In this web application, you'll be able to view and manage peering relationships, assets, and wallet addresses, among other settings.

![Rafiki Admin home screen](/img/rafiki-admin.png)

In order to run Rafiki Admin you'll need a Rafiki backend instance up and running, an Ory Kratos identity management service, and an SMTP mail server for sending account recovery emails. All of these services, along with Rafiki Admin are available within the local playground for testing and devlopment purposes. See the local environment pages for more information on how to set it up. TLDR: to get the whole environment up, run the command `pnpm localenv:compose up` from the root of your project.

Access to Rafiki Admin is restricted to ensure that only authorized users can register. This is achieved by using an invitation-only system, where new users are invited by an administrator. The registration flow is not public, so users cannot sign up on their own. Instead, administrators create accounts using the `invite-user` script. See [Rafiki Admin Auth](/rafikiadmin/auth) for more details.
