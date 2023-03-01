[open-payments](../README.md) / [Modules](../modules.md) / [grant](../modules/grant.md) / GrantRoutes

# Interface: GrantRoutes

[grant](../modules/grant.md).GrantRoutes

## Table of contents

### Methods

- [cancel](grant.GrantRoutes.md#cancel)
- [continue](grant.GrantRoutes.md#continue)
- [request](grant.GrantRoutes.md#request)

## Methods

### cancel

▸ **cancel**(`postArgs`): `Promise`<`void`\>

Cancels a grant.

**`See`**

[Open Payments - Cancel Grant](https://docs.openpayments.guide/reference/delete-continue)

#### Parameters

| Name | Type |
| :------ | :------ |
| `postArgs` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |

#### Returns

`Promise`<`void`\>

#### Defined in

[client/grant.ts:39](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/grant.ts#L39)

___

### continue

▸ **continue**(`postArgs`, `args`): `Promise`<`Grant`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `postArgs` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |
| `args` | `GrantContinuationRequest` |

#### Returns

`Promise`<`Grant`\>

#### Defined in

[client/grant.ts:31](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/grant.ts#L31)

___

### request

▸ **request**(`postArgs`, `args`): `Promise`<`Grant` \| `PendingGrant`\>

Makes a new grant request.

**`See`**

[Open Payments - Grant Request](https://docs.openpayments.guide/reference/post-request)

#### Parameters

| Name | Type |
| :------ | :------ |
| `postArgs` | [`UnauthenticatedResourceRequestArgs`](index.UnauthenticatedResourceRequestArgs.md) |
| `args` | `Omit`<`GrantRequest`, ``"client"``\> |

#### Returns

`Promise`<`Grant` \| `PendingGrant`\>

A grant with an access token, or a pending grant that requires user-interaction.

#### Defined in

[client/grant.ts:27](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/grant.ts#L27)
