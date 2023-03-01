[open-payments](../README.md) / [Modules](../modules.md) / [payment-pointer](../modules/payment_pointer.md) / PaymentPointerRoutes

# Interface: PaymentPointerRoutes

[payment-pointer](../modules/payment_pointer.md).PaymentPointerRoutes

## Table of contents

### Methods

- [get](payment_pointer.PaymentPointerRoutes.md#get)
- [getKeys](payment_pointer.PaymentPointerRoutes.md#getkeys)

## Methods

### get

▸ **get**(`args`): `Promise`<{ `assetCode`: `string` ; `assetScale`: `number` ; `authServer`: `string` ; `id`: `string` ; `publicName?`: `string`  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`UnauthenticatedResourceRequestArgs`](index.UnauthenticatedResourceRequestArgs.md) |

#### Returns

`Promise`<{ `assetCode`: `string` ; `assetScale`: `number` ; `authServer`: `string` ; `id`: `string` ; `publicName?`: `string`  }\>

#### Defined in

[client/payment-pointer.ts:7](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/payment-pointer.ts#L7)

___

### getKeys

▸ **getKeys**(`args`): `Promise`<{ `keys`: { `alg`: ``"EdDSA"`` ; `crv`: ``"Ed25519"`` ; `kid`: `string` ; `kty`: ``"OKP"`` ; `use?`: ``"sig"`` ; `x`: `string`  }[]  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `args` | [`UnauthenticatedResourceRequestArgs`](index.UnauthenticatedResourceRequestArgs.md) |

#### Returns

`Promise`<{ `keys`: { `alg`: ``"EdDSA"`` ; `crv`: ``"Ed25519"`` ; `kid`: `string` ; `kty`: ``"OKP"`` ; `use?`: ``"sig"`` ; `x`: `string`  }[]  }\>

#### Defined in

[client/payment-pointer.ts:8](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/payment-pointer.ts#L8)
