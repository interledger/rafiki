# Management

After Rafiki has been deployed, [Account Servicing Entities](../reference/glossary.md#account-servicing-entity) can manage their Rafiki instance via two GraphQL Admin APIs, the [`backend` Admin API](../apis/backend/queries.md) and the [`auth` Admin API](../apis/auth/queries.md).

The `backend` Admin API allows ASE's to manage:

- [assets](../reference/glossary.md#asset)
- [peers](../reference/glossary.md#peer)
- [payment pointers](../reference/glossary.md#payment-pointer)
- [Open Payments](../reference/glossary.md#open-payments) resources
- several types of [liquidity](../concepts/accounting/liquidity.md) within Rafiki

The `auth` Admin API allows Account Servicing Entities to manage [Open Payments](../reference/glossary.md#open-payments) [grants](../reference/glossary.md#grant-negotiation-authorization-protocol).
