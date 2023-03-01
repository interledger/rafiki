[open-payments](../README.md) / [Modules](../modules.md) / token

# Module: token

## Table of contents

### Interfaces

- [TokenRoutes](../interfaces/token.TokenRoutes.md)

### Functions

- [createTokenRoutes](token.md#createtokenroutes)
- [revokeToken](token.md#revoketoken)
- [rotateToken](token.md#rotatetoken)

## Functions

### createTokenRoutes

▸ **createTokenRoutes**(`deps`): [`TokenRoutes`](../interfaces/token.TokenRoutes.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `deps` | `RouteDeps` |

#### Returns

[`TokenRoutes`](../interfaces/token.TokenRoutes.md)

#### Defined in

[client/token.ts:53](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/token.ts#L53)

___

### revokeToken

▸ **revokeToken**(`deps`, `args`, `validateOpenApiResponse`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `deps` | `RouteDeps` |
| `args` | [`ResourceRequestArgs`](../interfaces/index.ResourceRequestArgs.md) |
| `validateOpenApiResponse` | `ResponseValidator`<`void`\> |

#### Returns

`Promise`<`void`\>

#### Defined in

[client/token.ts:32](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/token.ts#L32)

___

### rotateToken

▸ **rotateToken**(`deps`, `args`, `validateOpenApiResponse`): `Promise`<`AccessToken`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `deps` | `RouteDeps` |
| `args` | [`ResourceRequestArgs`](../interfaces/index.ResourceRequestArgs.md) |
| `validateOpenApiResponse` | `ResponseValidator`<`AccessToken`\> |

#### Returns

`Promise`<`AccessToken`\>

#### Defined in

[client/token.ts:11](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/token.ts#L11)
