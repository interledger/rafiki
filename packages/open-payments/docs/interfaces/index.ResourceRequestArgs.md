[open-payments](../README.md) / [Modules](../modules.md) / [index](../modules/index.md) / ResourceRequestArgs

# Interface: ResourceRequestArgs

[index](../modules/index.md).ResourceRequestArgs

## Hierarchy

- [`UnauthenticatedResourceRequestArgs`](index.UnauthenticatedResourceRequestArgs.md)

- `AuthenticatedRequestArgs`

  ↳ **`ResourceRequestArgs`**

## Table of contents

### Properties

- [accessToken](index.ResourceRequestArgs.md#accesstoken)
- [url](index.ResourceRequestArgs.md#url)

## Properties

### accessToken

• **accessToken**: `string`

#### Inherited from

AuthenticatedRequestArgs.accessToken

#### Defined in

[client/index.ts:55](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L55)

___

### url

• **url**: `string`

The full url of the resource.
e.g. https://openpayments.guide/alice/incoming-payments/08394f02-7b7b-45e2-b645-51d04e7c330c

#### Inherited from

[UnauthenticatedResourceRequestArgs](index.UnauthenticatedResourceRequestArgs.md).[url](index.UnauthenticatedResourceRequestArgs.md#url)

#### Defined in

[client/index.ts:51](https://github.com/interledger/rafiki/blob/44b48cce/packages/open-payments/src/client/index.ts#L51)
