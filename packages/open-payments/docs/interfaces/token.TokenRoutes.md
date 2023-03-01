[open-payments](../README.md) / [Modules](../modules.md) / [token](../modules/token.md) / TokenRoutes

# Interface: TokenRoutes

[token](../modules/token.md).TokenRoutes

## Table of contents

### Methods

- [revoke](token.TokenRoutes.md#revoke)
- [rotate](token.TokenRoutes.md#rotate)

## Methods

### revoke

▸ **revoke**(`args`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |

#### Returns

`Promise`<`void`\>

#### Defined in

[client/token.ts:8](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/token.ts#L8)

___

### rotate

▸ **rotate**(`args`): `Promise`<`AccessToken`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |

#### Returns

`Promise`<`AccessToken`\>

#### Defined in

[client/token.ts:7](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/token.ts#L7)
