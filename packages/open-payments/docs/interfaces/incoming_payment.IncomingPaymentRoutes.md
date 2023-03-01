[open-payments](../README.md) / [Modules](../modules.md) / [incoming-payment](../modules/incoming_payment.md) / IncomingPaymentRoutes

# Interface: IncomingPaymentRoutes

[incoming-payment](../modules/incoming_payment.md).IncomingPaymentRoutes

## Table of contents

### Methods

- [complete](incoming_payment.IncomingPaymentRoutes.md#complete)
- [create](incoming_payment.IncomingPaymentRoutes.md#create)
- [get](incoming_payment.IncomingPaymentRoutes.md#get)
- [list](incoming_payment.IncomingPaymentRoutes.md#list)

## Methods

### complete

▸ **complete**(`args`): `Promise`<{ `completed`: `boolean` ; `createdAt`: `string` ; `description?`: `string` ; `expiresAt?`: `string` ; `externalRef?`: `string` ; `id`: `string` ; `incomingAmount?`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `paymentPointer`: `string` ; `receivedAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |

#### Returns

`Promise`<{ `completed`: `boolean` ; `createdAt`: `string` ; `description?`: `string` ; `expiresAt?`: `string` ; `externalRef?`: `string` ; `id`: `string` ; `incomingAmount?`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `paymentPointer`: `string` ; `receivedAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  }\>

#### Defined in

[client/incoming-payment.ts:30](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/incoming-payment.ts#L30)

___

### create

▸ **create**(`args`, `createArgs`): `Promise`<{ `completed`: `boolean` ; `createdAt`: `string` ; `description?`: `string` ; `expiresAt?`: `string` ; `externalRef?`: `string` ; `id`: `string` ; `incomingAmount?`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `paymentPointer`: `string` ; `receivedAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  } & { `ilpStreamConnection?`: { `assetCode`: `string` ; `assetScale`: `number` ; `id`: `string` ; `ilpAddress`: `string` ; `sharedSecret`: `string`  }  }\>

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `args` | [`CollectionRequestArgs`](index.CollectionRequestArgs.md) | - |
| `createArgs` | `Object` | - |
| `createArgs.description?` | `string` | **`Description`** Human readable description of the incoming payment that will be visible to the account holder. |
| `createArgs.expiresAt?` | `string` | Format: date-time **`Description`** The date and time when payments into the incoming payment must no longer be accepted. |
| `createArgs.externalRef?` | `string` | **`Description`** A reference that can be used by external systems to reconcile this payment with their systems. E.g. An invoice number. (Optional) |
| `createArgs.incomingAmount?` | `Object` | **`Description`** The maximum amount that should be paid into the payment pointer under this incoming payment. |
| `createArgs.incomingAmount.assetCode` | `string` | - |
| `createArgs.incomingAmount.assetScale` | `number` | - |
| `createArgs.incomingAmount.value` | `string` | Format: uint64 **`Description`** The value is an unsigned 64-bit integer amount, represented as a string. |

#### Returns

`Promise`<{ `completed`: `boolean` ; `createdAt`: `string` ; `description?`: `string` ; `expiresAt?`: `string` ; `externalRef?`: `string` ; `id`: `string` ; `incomingAmount?`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `paymentPointer`: `string` ; `receivedAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  } & { `ilpStreamConnection?`: { `assetCode`: `string` ; `assetScale`: `number` ; `id`: `string` ; `ilpAddress`: `string` ; `sharedSecret`: `string`  }  }\>

#### Defined in

[client/incoming-payment.ts:26](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/incoming-payment.ts#L26)

___

### get

▸ **get**(`args`): `Promise`<{ `completed`: `boolean` ; `createdAt`: `string` ; `description?`: `string` ; `expiresAt?`: `string` ; `externalRef?`: `string` ; `id`: `string` ; `incomingAmount?`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `paymentPointer`: `string` ; `receivedAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  } & { `ilpStreamConnection?`: { `assetCode`: `string` ; `assetScale`: `number` ; `id`: `string` ; `ilpAddress`: `string` ; `sharedSecret`: `string`  }  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`ResourceRequestArgs`](index.ResourceRequestArgs.md) |

#### Returns

`Promise`<{ `completed`: `boolean` ; `createdAt`: `string` ; `description?`: `string` ; `expiresAt?`: `string` ; `externalRef?`: `string` ; `id`: `string` ; `incomingAmount?`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `paymentPointer`: `string` ; `receivedAmount`: { `assetCode`: `string` ; `assetScale`: `number` ; `value`: `string`  } ; `updatedAt`: `string`  } & { `ilpStreamConnection?`: { `assetCode`: `string` ; `assetScale`: `number` ; `id`: `string` ; `ilpAddress`: `string` ; `sharedSecret`: `string`  }  }\>

#### Defined in

[client/incoming-payment.ts:25](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/incoming-payment.ts#L25)

___

### list

▸ **list**(`args`, `pagination?`): `Promise`<`IncomingPaymentPaginationResult`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`CollectionRequestArgs`](index.CollectionRequestArgs.md) |
| `pagination?` | `PaginationArgs` |

#### Returns

`Promise`<`IncomingPaymentPaginationResult`\>

#### Defined in

[client/incoming-payment.ts:31](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/incoming-payment.ts#L31)
