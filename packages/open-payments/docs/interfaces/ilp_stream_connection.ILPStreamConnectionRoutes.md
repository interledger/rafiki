[open-payments](../README.md) / [Modules](../modules.md) / [ilp-stream-connection](../modules/ilp_stream_connection.md) / ILPStreamConnectionRoutes

# Interface: ILPStreamConnectionRoutes

[ilp-stream-connection](../modules/ilp_stream_connection.md).ILPStreamConnectionRoutes

## Table of contents

### Methods

- [get](ilp_stream_connection.ILPStreamConnectionRoutes.md#get)

## Methods

### get

▸ **get**(`args`): `Promise`<{ `assetCode`: `string` ; `assetScale`: `number` ; `id`: `string` ; `ilpAddress`: `string` ; `sharedSecret`: `string`  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`UnauthenticatedResourceRequestArgs`](index.UnauthenticatedResourceRequestArgs.md) |

#### Returns

`Promise`<{ `assetCode`: `string` ; `assetScale`: `number` ; `id`: `string` ; `ilpAddress`: `string` ; `sharedSecret`: `string`  }\>

#### Defined in

[client/ilp-stream-connection.ts:7](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/ilp-stream-connection.ts#L7)
