[open-payments](../README.md) / [Modules](../modules.md) / [outgoing-payment](../modules/outgoing_payment.md) / OutgoingPaymentRoutes

# Interface: OutgoingPaymentRoutes

[outgoing-payment](../modules/outgoing_payment.md).OutgoingPaymentRoutes

## Table of contents

### Methods

- [create](outgoing_payment.OutgoingPaymentRoutes.md#create)
- [get](outgoing_payment.OutgoingPaymentRoutes.md#get)
- [list](outgoing_payment.OutgoingPaymentRoutes.md#list)

## Methods

### create

▸ **create**(`requestArgs`, `createArgs`): `Promise`<{ `createdAt`: `string` ; `description?`: `string` ; `externalRef?`: `string` ; `failed?`: `boolean` ; `id`: `string` ; `paymentPointer`: `string` ; `quoteId?`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `sentAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  }\>

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `requestArgs` | [`CollectionRequestArgs`](index.CollectionRequestArgs.md) | - |
| `createArgs` | `Object` | - |
| `createArgs.description?` | `string` | **`Description`** Human readable description of the outgoing payment that will be visible to the account holder and shared with the receiver. |
| `createArgs.externalRef?` | `string` | **`Description`** A reference that can be used by external systems to reconcile this payment with their systems. E.g. An invoice number. (Optional) |
| `createArgs.quoteId` | `string` | Format: uri **`Description`** The URL of the quote defining this payment's amounts. |

#### Returns

`Promise`<{ `createdAt`: `string` ; `description?`: `string` ; `externalRef?`: `string` ; `failed?`: `boolean` ; `id`: `string` ; `paymentPointer`: `string` ; `quoteId?`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `sentAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  }\>

#### Defined in

[client/outgoing-payment.ts:23](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/outgoing-payment.ts#L23)

___

### get

▸ **get**(`args`): `Promise`<{ `createdAt`: `string` ; `description?`: `string` ; `externalRef?`: `string` ; `failed?`: `boolean` ; `id`: `string` ; `paymentPointer`: `string` ; `quoteId?`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `sentAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |

#### Returns

`Promise`<{ `createdAt`: `string` ; `description?`: `string` ; `externalRef?`: `string` ; `failed?`: `boolean` ; `id`: `string` ; `paymentPointer`: `string` ; `quoteId?`: `string` ; `receiveAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `receiver`: `string` ; `sendAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `sentAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  }\>

#### Defined in

[client/outgoing-payment.ts:18](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/outgoing-payment.ts#L18)

___

### list

▸ **list**(`args`, `pagination?`): `Promise`<`OutgoingPaymentPaginationResult`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`CollectionRequestArgs`](index.CollectionRequestArgs.md) |
| `pagination?` | `PaginationArgs` |

#### Returns

`Promise`<`OutgoingPaymentPaginationResult`\>

#### Defined in

[client/outgoing-payment.ts:19](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/outgoing-payment.ts#L19)
