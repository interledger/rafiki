[open-payments](../README.md) / [Modules](../modules.md) / [quote](../modules/quote.md) / QuoteRoutes

# Interface: QuoteRoutes

[quote](../modules/quote.md).QuoteRoutes

## Table of contents

### Methods

- [create](quote.QuoteRoutes.md#create)
- [get](quote.QuoteRoutes.md#get)

## Methods

### create

▸ **create**(`createArgs`, `createQuoteArgs`): `Promise`<{ `createdAt`: `string` ; `expiresAt?`: `string` ; `id`: `string` ; `paymentPointer`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  }  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `createArgs` | [`CollectionRequestArgs`](index.CollectionRequestArgs.md) |
| `createQuoteArgs` | `CreateQuoteArgs` |

#### Returns

`Promise`<{ `createdAt`: `string` ; `expiresAt?`: `string` ; `id`: `string` ; `paymentPointer`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  }  }\>

#### Defined in

[client/quote.ts:13](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/quote.ts#L13)

___

### get

▸ **get**(`args`): `Promise`<{ `createdAt`: `string` ; `expiresAt?`: `string` ; `id`: `string` ; `paymentPointer`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  }  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |

#### Returns

`Promise`<{ `createdAt`: `string` ; `expiresAt?`: `string` ; `id`: `string` ; `paymentPointer`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  }  }\>

#### Defined in

[client/quote.ts:12](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/quote.ts#L12)
