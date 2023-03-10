# Accounts and Transfers

## Accounts

Rafiki uses a combination of liquidity and settlement accounts to perform double-entry accounting.

### Liquidity account

A liquidity account may only hold a positive balance. Rafiki enforces that its total debits MUST NOT exceed its total credits amount.

There is one liquidity account for each of the following resource:

- Asset
- Peer
- Payment Pointer (for [SPSP](./glossary.md#simple-payments-setup-protocol-spsp) / [Web Monetization](./glossary.md#web-monetization) receiving)
- Incoming Payment
- Outgoing Payment

### Settlement account

A settlement account may only hold a negative balance. Rafiki enforces that its total credits MUST NOT exceed its total debits amount. A settlement account represents those total amount of funds an [Account Servicing Entity](./glossary.md#account-servicing-entity) has deposited into Rafiki.

There is one settlement account for each asset.

## Transfers

Rafiki transfers perform double-entry accounting. Every transfer increases both the total debits of one account and the total credits of a second account by the same amount.

### Intra-Rafiki

#### Deposits

| Debit Account | Credit Account  |
| ------------- | --------------- |
| Settlement    | Asset Liquidity |

| Debit Account | Credit Account |
| ------------- | -------------- |
| Settlement    | Peer Liquidity |

| Debit Account | Credit Account   |
| ------------- | ---------------- |
| Settlement    | Outgoing Payment |

#### Withdrawals

| Debit Account   | Credit Account |
| --------------- | -------------- |
| Asset Liquidity | Settlement     |

| Debit Account  | Credit Account |
| -------------- | -------------- |
| Peer Liquidity | Settlement     |

| Debit Account    | Credit Account |
| ---------------- | -------------- |
| Incoming Payment | Settlement     |

| Debit Account   | Credit Account |
| --------------- | -------------- |
| Payment Pointer | Settlement     |

| Debit Account    | Credit Account |
| ---------------- | -------------- |
| Outgoing Payment | Settlement     |

#### Payments (Same Asset)

##### SPSP / Web Monetization

| Debit Account    | Credit Account  |
| ---------------- | --------------- |
| Outgoing Payment | Payment Pointer |

##### Send Amount < Receive Amount

| Debit Account    | Credit Account   |
| ---------------- | ---------------- |
| Outgoing Payment | Incoming Payment |
| Asset Liquidity  | Incoming Payment |

##### Send Amount > Receive Amount

| Debit Account    | Credit Account   |
| ---------------- | ---------------- |
| Outgoing Payment | Incoming Payment |
| Outgoing Payment | Asset Liquidity  |

#### Payments (Cross Currency)

| Debit Account    | Credit Account   | Asset |
| ---------------- | ---------------- | ----- |
| Outgoing Payment | Asset Liquidity  | ABC   |
| Asset Liquidity  | Incoming Payment | XYZ   |

##### SPSP / Web Monetization

| Debit Account    | Credit Account  | Asset |
| ---------------- | --------------- | ----- |
| Outgoing Payment | Asset Liquidity | ABC   |
| Asset Liquidity  | Payment Pointer | XYZ   |

### Interledger

#### Sending Connector

##### Same asset

| Debit Account    | Credit Account |
| ---------------- | -------------- |
| Outgoing Payment | Peer Liquidity |

##### Cross currency

| Debit Account    | Credit Account  | Asset |
| ---------------- | --------------- | ----- |
| Outgoing Payment | Asset Liquidity | ABC   |
| Asset Liquidity  | Peer Liquidity  | XYZ   |

#### Receiving Connector

##### Same asset

| Debit Account  | Credit Account   |
| -------------- | ---------------- |
| Peer Liquidity | Incoming Payment |

###### SPSP / Web Monetization

| Debit Account  | Credit Account  |
| -------------- | --------------- |
| Peer Liquidity | Payment Pointer |

##### Cross currency

| Debit Account   | Credit Account   | Asset |
| --------------- | ---------------- | ----- |
| Peer Liquidity  | Asset Liquidity  | ABC   |
| Asset Liquidity | Incoming Payment | XYZ   |

###### SPSP / Web Monetization

| Debit Account   | Credit Account  | Asset |
| --------------- | --------------- | ----- |
| Peer Liquidity  | Asset Liquidity | ABC   |
| Asset Liquidity | Payment Pointer | XYZ   |

#### Connector

##### Same asset

| Debit Account  | Credit Account |
| -------------- | -------------- |
| Peer Liquidity | Peer Liquidity |

##### Cross currency

| Debit Account   | Credit Account  | Asset |
| --------------- | --------------- | ----- |
| Peer Liquidity  | Asset Liquidity | ABC   |
| Asset Liquidity | Peer Liquidity  | XYZ   |
