[open-payments](../README.md) / [Modules](../modules.md) / index

# Module: index

## Table of contents

### Interfaces

- [AuthenticatedClient](../interfaces/index.AuthenticatedClient.md)
- [CollectionRequestArgs](../interfaces/index.CollectionRequestArgs.md)
- [CreateAuthenticatedClientArgs](../interfaces/index.CreateAuthenticatedClientArgs.md)
- [CreateUnauthenticatedClientArgs](../interfaces/index.CreateUnauthenticatedClientArgs.md)
- [ResourceRequestArgs](../interfaces/index.ResourceRequestArgs.md)
- [UnauthenticatedClient](../interfaces/index.UnauthenticatedClient.md)
- [UnauthenticatedResourceRequestArgs](../interfaces/index.UnauthenticatedResourceRequestArgs.md)

### Functions

- [createAuthenticatedClient](index.md#createauthenticatedclient)
- [createUnauthenticatedClient](index.md#createunauthenticatedclient)

## Functions

### createAuthenticatedClient

▸ **createAuthenticatedClient**(`args`): `Promise`<[`AuthenticatedClient`](../interfaces/index.AuthenticatedClient.md)\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`CreateAuthenticatedClientArgs`](../interfaces/index.CreateAuthenticatedClientArgs.md) |

#### Returns

`Promise`<[`AuthenticatedClient`](../interfaces/index.AuthenticatedClient.md)\>

#### Defined in

[client/index.ts:141](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L141)

___

### createUnauthenticatedClient

▸ **createUnauthenticatedClient**(`args`): `Promise`<[`UnauthenticatedClient`](../interfaces/index.UnauthenticatedClient.md)\>

Creates an OpenPayments client that only makes unauthenticated requests.

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`CreateUnauthenticatedClientArgs`](../interfaces/index.CreateUnauthenticatedClientArgs.md) |

#### Returns

`Promise`<[`UnauthenticatedClient`](../interfaces/index.UnauthenticatedClient.md)\>

#### Defined in

[client/index.ts:105](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L105)
