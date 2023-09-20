---
title: Asset
---

As per the [Mariam Webster Dictionary](https://www.merriam-webster.com/dictionary/asset), an Asset is "an item of value owned". Since the Interledger Protocol aims to create an internet of value, it allows for the transfer of any asset, not just currency. In reality, however, mainly assets denominated in a currency, i.e. fiat, commodity, or alternative currencies like crypto and branded currencies, are transferred via the Interledger Protocol.

## The `Asset` type

The `Asset` type in Rafiki is comprised of a value, an asset code, and an asset scale.

| Property   | Type    | Example |
| ---------- | ------- | ------- |
| value      | BigInt  | `10000` |
| assetCode  | String  | `"USD"` |
| assetScale | Integer | `2`     |

The asset code SHOULD be an [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), if it is available for the asset. The asset scale is the difference in orders of magnitude between the standard unit and a corresponding fractional unit. To convert from `Asset` to a currency amount that is more common to humans, apply the following formula:

$currencyAmount = \frac{value}{10^{assetScale}}$

Hence, the above example represents $\frac{10000}{10^2} =100.00$ USD.

Assets are represented in the `Asset` type due to JavaScript/Typescript's deficiencies when handling floats.

## Assets in Rafiki

When two Account Servicing Entities peer their Rafiki instances, they need to define the asset(s) they are going to settle in. The Interledger packets they are going to exchange will then also be denominated in that asset.

Furthermore, if an Account Servicing Entity is performing currency exchange, they need to provide [asset liquidity](/concepts/accounting/liquidity#asset-liquidity).

Assets can be created and managed via the Admin GraphQL API directly or via the Rafiki Admin dashboard. Currently, [wallet addresss](/reference/glossary#payment-pointer) can only be created for an existing asset and are tied to that asset.
