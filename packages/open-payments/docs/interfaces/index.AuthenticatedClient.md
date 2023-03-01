[open-payments](../README.md) / [Modules](../modules.md) / [index](../modules/index.md) / AuthenticatedClient

# Interface: AuthenticatedClient

[index](../modules/index.md).AuthenticatedClient

## Hierarchy

- [`UnauthenticatedClient`](index.UnauthenticatedClient.md)

  ↳ **`AuthenticatedClient`**

## Table of contents

### Properties

- [grant](index.AuthenticatedClient.md#grant)
- [ilpStreamConnection](index.AuthenticatedClient.md#ilpstreamconnection)
- [incomingPayment](index.AuthenticatedClient.md#incomingpayment)
- [outgoingPayment](index.AuthenticatedClient.md#outgoingpayment)
- [paymentPointer](index.AuthenticatedClient.md#paymentpointer)
- [quote](index.AuthenticatedClient.md#quote)
- [token](index.AuthenticatedClient.md#token)

## Properties

### grant

• **grant**: [`GrantRoutes`](grant.GrantRoutes.md)

#### Defined in

[client/index.ts:136](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L136)

___

### ilpStreamConnection

• **ilpStreamConnection**: [`ILPStreamConnectionRoutes`](ilp_stream_connection.ILPStreamConnectionRoutes.md)

#### Inherited from

[UnauthenticatedClient](index.UnauthenticatedClient.md).[ilpStreamConnection](index.UnauthenticatedClient.md#ilpstreamconnection)

#### Defined in

[client/index.ts:98](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L98)

___

### incomingPayment

• **incomingPayment**: [`IncomingPaymentRoutes`](incoming_payment.IncomingPaymentRoutes.md)

#### Defined in

[client/index.ts:134](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L134)

___

### outgoingPayment

• **outgoingPayment**: [`OutgoingPaymentRoutes`](outgoing_payment.OutgoingPaymentRoutes.md)

#### Defined in

[client/index.ts:135](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L135)

___

### paymentPointer

• **paymentPointer**: [`PaymentPointerRoutes`](payment_pointer.PaymentPointerRoutes.md)

#### Inherited from

[UnauthenticatedClient](index.UnauthenticatedClient.md).[paymentPointer](index.UnauthenticatedClient.md#paymentpointer)

#### Defined in

[client/index.ts:99](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L99)

___

### quote

• **quote**: [`QuoteRoutes`](quote.QuoteRoutes.md)

#### Defined in

[client/index.ts:138](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L138)

___

### token

• **token**: [`TokenRoutes`](token.TokenRoutes.md)

#### Defined in

[client/index.ts:137](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L137)
