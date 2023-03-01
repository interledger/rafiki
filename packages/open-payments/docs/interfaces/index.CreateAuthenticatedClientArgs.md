[open-payments](../README.md) / [Modules](../modules.md) / [index](../modules/index.md) / CreateAuthenticatedClientArgs

# Interface: CreateAuthenticatedClientArgs

[index](../modules/index.md).CreateAuthenticatedClientArgs

## Hierarchy

- [`CreateUnauthenticatedClientArgs`](index.CreateUnauthenticatedClientArgs.md)

  ↳ **`CreateAuthenticatedClientArgs`**

## Table of contents

### Properties

- [keyId](index.CreateAuthenticatedClientArgs.md#keyid)
- [logger](index.CreateAuthenticatedClientArgs.md#logger)
- [paymentPointerUrl](index.CreateAuthenticatedClientArgs.md#paymentpointerurl)
- [privateKey](index.CreateAuthenticatedClientArgs.md#privatekey)
- [requestTimeoutMs](index.CreateAuthenticatedClientArgs.md#requesttimeoutms)

## Properties

### keyId

• **keyId**: `string`

#### Defined in

[client/index.ts:129](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L129)

___

### logger

• `Optional` **logger**: `Logger`<`LoggerOptions`\>

The custom logger instance to use. This defaults to the pino logger.

#### Inherited from

[CreateUnauthenticatedClientArgs](index.CreateUnauthenticatedClientArgs.md).[logger](index.CreateUnauthenticatedClientArgs.md#logger)

#### Defined in

[client/index.ts:94](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L94)

___

### paymentPointerUrl

• **paymentPointerUrl**: `string`

#### Defined in

[client/index.ts:130](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L130)

___

### privateKey

• **privateKey**: `KeyLike`

#### Defined in

[client/index.ts:128](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L128)

___

### requestTimeoutMs

• `Optional` **requestTimeoutMs**: `number`

Milliseconds to wait before timing out an HTTP request

#### Inherited from

[CreateUnauthenticatedClientArgs](index.CreateUnauthenticatedClientArgs.md).[requestTimeoutMs](index.CreateUnauthenticatedClientArgs.md#requesttimeoutms)

#### Defined in

[client/index.ts:92](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L92)
