---
title: Overview
---

## What is Rafiki?

Rafiki is open source software that allows an [Account Servicing Entity](/reference/glossary#account-servicing-entity) to enable [Interledger](/reference/glossary#interledger-protocol) functionality on its users' accounts.

This includes

- sending and receiving payments (via [SPSP](/reference/glossary#simple-payments-setup-protocol-spsp) and [Open Payments](/reference/glossary#open-payments))
- allowing third-party access to initiate payments and view transation data (via [Open Payments](/reference/glossary#open-payments))

:::caution
Rafiki is intended to be run by [Account Servicing Entities](/reference/glossary#account-servicing-entity) only and should not be used in production by non-regulated entities.
:::

Rafiki is made up of several components including an Interledger connector, a high-throughput accounting database called [TigerBeetle](/reference/glossary#tigerbeetle), and several APIs:

- the [Admin API](/integration/management) to create [peering relationships](/reference/glossary#peer), add supported [assets](/reference/glossary#asset), and issue [wallet addresses](/reference/glossary#wallet-address)
- the [Open Payments](/reference/glossary#open-payments) API to allow third-parties (with the account holder's consent) to initiate payments and to view the transaction history
- the [SPSP](/reference/glossary#simple-payments-setup-protocol-spsp) API for simple Interledger Payments

Additionally, this package also includes a reference implementation of a [GNAP](/reference/glossary#grant-negotiation-authorization-protocol) authorization server which handles the access control for the [Open Payments](/reference/glossary#open-payments) API. For more information on the architecture, check out the [Architecture documentation](architecture).
