---
title: Management
---

After Rafiki has been deployed, [Account Servicing Entities](/reference/glossary#account-servicing-entity) can manage their Rafiki instance via two GraphQL Admin APIs, the [`backend` Admin API](/apis/backend/mutations) and the [`auth` Admin API](/apis/auth/mutations).

The `backend` Admin API allows Account Servicing Entities to manage:

- [assets](/reference/glossary#asset)
- [peers](/reference/glossary#peer)
- [wallet addresses](/reference/glossary#wallet-address)
- [Open Payments](/reference/glossary#open-payments) resources
- several types of [liquidity](/concepts/accounting/liquidity) within Rafiki

The `auth` Admin API allows Account Servicing Entities to manage [Open Payments](/reference/glossary#open-payments) [grants](/reference/glossary#grant-negotiation-authorization-protocol).
