# Rafiki backend accounts

## Design

[![](https://mermaid.ink/img/pako:eNqNVD1vwjAQ_SuRBxQkUHcGpCI6dGqqMrXpYJIjWE1sap8HhPjv9Uccx1GQypCc77179-ELN1KJGsiGNJJeztlhX_LM_JQ-eseRVj_Aa-995ZXoGG_yYBT02gHHpYffNDbCwsFI4XctEHL37D09XhgugszTY895riqhOVrZaAZMKcDcPYMiWB2YRqv97iuEq-W3xw6ScnUC6cDhEFCn6sKsMbjTGi2eegZiGJGlTMY1cMKcLGcys4Hj5mUJzoh1QJ8dZnJm6_V2VMAMmBadVuMILtuogodREe0rnRGLfcbivaDrYm6y2cLfgHkPUovYwyJoZC371axmeM2ov18nHFdldJuWbl7Ygk30kD9bjiNZkelWWtFCKGwkqKcDa0DuAEyKsawKPf4zbLSZD4uZLmLa5zbsr3ebL5isSAeyo6w2H_vNukuCZzOJkmyMWcOJ6hZLUvK7oepLTRFezFyFJBuUGlaEahQfV16Fs-fsGTX_FF1wXij_FMIcT7RVcP8DQHN1Og?type=png)](https://mermaid-js.github.io/mermaid-live-editor/edit#pako:eNqNVD1vwjAQ_SuRBxQkUHcGpCI6dGqqMrXpYJIjWE1sap8HhPjv9Uccx1GQypCc77179-ELN1KJGsiGNJJeztlhX_LM_JQ-eseRVj_Aa-995ZXoGG_yYBT02gHHpYffNDbCwsFI4XctEHL37D09XhgugszTY895riqhOVrZaAZMKcDcPYMiWB2YRqv97iuEq-W3xw6ScnUC6cDhEFCn6sKsMbjTGi2eegZiGJGlTMY1cMKcLGcys4Hj5mUJzoh1QJ8dZnJm6_V2VMAMmBadVuMILtuogodREe0rnRGLfcbivaDrYm6y2cLfgHkPUovYwyJoZC371axmeM2ov18nHFdldJuWbl7Ygk30kD9bjiNZkelWWtFCKGwkqKcDa0DuAEyKsawKPf4zbLSZD4uZLmLa5zbsr3ebL5isSAeyo6w2H_vNukuCZzOJkmyMWcOJ6hZLUvK7oepLTRFezFyFJBuUGlaEahQfV16Fs-fsGTX_FF1wXij_FMIcT7RVcP8DQHN1Og)

## Account Types

### Liquidity account

A liquidity account may only hold a positive balance. Rafiki enforces that its total debits MUST NOT exceed its total credits amount.

### Settlement account

A settlement account may only hold a negative balance. Rafiki enforces that its total credits MUST NOT exceed its total debits amount. A settlement account represents those total amount of funds an [Account Servicing Entity](./glossary.md#account-servicing-entity) has deposited into Rafiki.

## Transfers

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

#### Payments

##### Same asset

| Debit Account    | Credit Account   |
| ---------------- | ---------------- |
| Outgoing Payment | Incoming Payment |

###### SPSP / Web Monetization

| Debit Account    | Credit Account  |
| ---------------- | --------------- |
| Outgoing Payment | Payment Pointer |

##### Cross currency

| Debit Account    | Credit Account   | Asset |
| ---------------- | ---------------- | ----- |
| Outgoing Payment | Asset Liquidity  | ABC   |
| Asset Liquidity  | Incoming Payment | XYZ   |

###### SPSP / Web Monetization

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
