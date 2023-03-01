[open-payments](../README.md) / [Modules](../modules.md) / [index](../modules/index.md) / CreateUnauthenticatedClientArgs

# Interface: CreateUnauthenticatedClientArgs

[index](../modules/index.md).CreateUnauthenticatedClientArgs

## Hierarchy

- **`CreateUnauthenticatedClientArgs`**

  ↳ [`CreateAuthenticatedClientArgs`](index.CreateAuthenticatedClientArgs.md)

## Table of contents

### Properties

- [logger](index.CreateUnauthenticatedClientArgs.md#logger)
- [requestTimeoutMs](index.CreateUnauthenticatedClientArgs.md#requesttimeoutms)

## Properties

### logger

• `Optional` **logger**: `Logger`<`LoggerOptions`\>

The custom logger instance to use. This defaults to the pino logger.

#### Defined in

[client/index.ts:94](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L94)

___

### requestTimeoutMs

• `Optional` **requestTimeoutMs**: `number`

Milliseconds to wait before timing out an HTTP request

#### Defined in

[client/index.ts:92](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L92)
