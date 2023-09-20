---
title: Accounts and Transfers
---

## Accounts

Rafiki uses a combination of liquidity and settlement accounts to perform [double-entry accounting](https://en.wikipedia.org/wiki/Double-entry_bookkeeping).

### Liquidity account

A liquidity account may only hold a positive balance. Rafiki enforces that its total debits MUST NOT exceed its total credits amount.

There is one liquidity account for each of the following resource:

- Asset
- Peer
- Wallet Address (for [SPSP](../../reference/glossary#spsp) / [Web Monetization](../../reference/glossary#web-monetization) receiving)
- Incoming Payment
- Outgoing Payment

Asset and Peer liquidity accounts are created when calling `createAsset` and `createPeer` [GraphQL Admin API mutations](../../apis/backend/mutations.md) respectively, while liquidity accounts for wallet addresss, incoming and outgoing payments are created on-the-fly during payment processing or web monetization events.

Any liquidity management is done by the [Account Servicing Entity](../../reference/glossary#account-servicing-entity) through the GraphQL Admin API. See [integration](../../integration/event-handlers.md) and [liquidity documentation](./liquidity.md) for more information.

### Settlement account

A settlement account may only hold a negative balance. Rafiki enforces that its total credits MUST NOT exceed its total debits amount. A settlement account represents those total amount of funds an [Account Servicing Entity](../../reference/glossary#account-servicing-entity) has deposited into Rafiki.

There is one settlement account for each asset.

## Transfers

Rafiki transfers perform double-entry accounting. Every transfer increases both the total debits of one account and the total credits of a second account by the same amount.

### Intra-Rafiki

#### Deposits

##### Depositing Asset Liquidity

| Debit Account | Credit Account  |
| ------------- | --------------- |
| Settlement    | Asset Liquidity |

- Example: depositing 100 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>100</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>100</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Depositing Peer Liquidity

| Debit Account | Credit Account |
| ------------- | -------------- |
| Settlement    | Peer Liquidity |

- Example: peering relationship in USD, depositing 100 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>Peer Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>100</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>100</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Depositing Outgoing Payment Liquidity

| Debit Account | Credit Account   |
| ------------- | ---------------- |
| Settlement    | Outgoing Payment |

- Example: depositing 35 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>Outgoing Payment Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>35</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>35</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

#### Withdrawals

##### Withdrawing Asset Liquidity

| Debit Account   | Credit Account |
| --------------- | -------------- |
| Asset Liquidity | Settlement     |

- Example: withdrawing 50 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr> 
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>50</td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>50</td><td></td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Withdrawing Peer Liquidity

| Debit Account  | Credit Account |
| -------------- | -------------- |
| Peer Liquidity | Settlement     |

- Example: peering relationship in USD, withdrawing 50 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>Peer Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>50</td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>50</td><td></td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Withdrawing Wallet Address Liquidity (example: 2 USD)

| Debit Account   | Credit Account |
| --------------- | -------------- |
| Wallet Address | Settlement     |

- Example: withdrawing 2 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>Wallet Address Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>2</td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>2</td><td></td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Withdrawing Incoming Payment Liquidity

| Debit Account    | Credit Account |
| ---------------- | -------------- |
| Incoming Payment | Settlement     |

- Example: withdrawing 25 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>Incoming Payment Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>25</td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>25</td><td></td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Withdrawing Outgoing Payment Liquidity

| Debit Account    | Credit Account |
| ---------------- | -------------- |
| Outgoing Payment | Settlement     |

- Example: withdrawing 1 USD

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>USD Settlement Acc. </th>
    <th>Outgoing Payment Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>1</td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>1</td><td></td>
        </tr>
      </table>
    </td>
  </tr>
</table>

#### Payments (Same Asset)

##### SPSP / Web Monetization

| Debit Account    | Credit Account  |
| ---------------- | --------------- |
| Outgoing Payment | Wallet Address |

- Example: Send a WM Payment of 2 USD over SPSP to a wallet address. Sender and receiver have wallet addresss at the same Rafiki.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Outgoing Payment Liquidity Acc.</th>
    <th>Wallet Address Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>2</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>2</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Send Amount < Receive Amount

| Debit Account    | Credit Account   |
| ---------------- | ---------------- |
| Outgoing Payment | Incoming Payment |
| Asset Liquidity  | Incoming Payment |

- Example: Sender consented to a payment of 14 USD but quote promised to deliver 15 USD.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Outgoing Payment Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
    <th>Incoming Payment Liquidity Acc. </th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>14</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>1</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>15</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Send Amount > Receive Amount

| Debit Account    | Credit Account   |
| ---------------- | ---------------- |
| Outgoing Payment | Incoming Payment |
| Outgoing Payment | Asset Liquidity  |

- Example: Sender consented to a payment of 15 USD but quote promised to deliver 14 USD.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Outgoing Payment Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
    <th>Incoming Payment Liquidity Acc. </th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>15</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>1</td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>14</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

#### Payments (Cross Currency)

| Debit Account    | Credit Account   | Asset |
| ---------------- | ---------------- | ----- |
| Outgoing Payment | Asset Liquidity  | ABC   |
| Asset Liquidity  | Incoming Payment | XYZ   |

- Example: Outgoing payment for 10 USD, incoming payment receives 9 EUR.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Outgoing Payment Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>10</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>10</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr class="header-row">
    <th>EUR (Asset) Liquidity Acc.</th>
    <th>Incoming Payment Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>9</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>9</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### SPSP / Web Monetization

| Debit Account    | Credit Account  | Asset |
| ---------------- | --------------- | ----- |
| Outgoing Payment | Asset Liquidity | ABC   |
| Asset Liquidity  | Wallet Address | XYZ   |

- Example: Outgoing payment for 2 USD, payemnt pointer receives 1 EUR.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Outgoing Payment Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>2</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>2</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr class="header-row">
    <th>EUR (Asset) Liquidity Acc.</th>
    <th>Wallet Address Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>1</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>1</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

### Interledger

Sender and receiver do not have wallet addresss at the same Rafiki instance.

#### Sending Connector

##### Same asset

| Debit Account    | Credit Account |
| ---------------- | -------------- |
| Outgoing Payment | Peer Liquidity |

- Example: Sender creates an outgoing payment for 100 USD to an incoming payment at a peer's Rafiki instance. The peering relationship is in USD.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Outgoing Payment Liquidity Acc.</th>
    <th>Peer Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>100</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>100</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Cross currency

| Debit Account    | Credit Account  | Asset |
| ---------------- | --------------- | ----- |
| Outgoing Payment | Asset Liquidity | ABC   |
| Asset Liquidity  | Peer Liquidity  | XYZ   |

- Example: Sender creates an outgoing payment for 100 USD to an incoming payment at a peer's Rafiki instance. The peering relationship is in EUR, so payment is converted on the sending side.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Outgoing Payment Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>100</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>100</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr class="header-row">
    <th>EUR (Asset) Liquidity Acc.</th>
    <th>Peer Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>90</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>90</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

#### Receiving Connector

##### Same asset

| Debit Account  | Credit Account   |
| -------------- | ---------------- |
| Peer Liquidity | Incoming Payment |

- Example: An incoming payment receives 100 USD from an outgoing payment at a peer's Rafiki instance.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Peer Liquidity Acc.</th>
    <th>Incoming Payment Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>100</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>100</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

###### SPSP / Web Monetization

| Debit Account  | Credit Account  |
| -------------- | --------------- |
| Peer Liquidity | Wallet Address |

- Example: A payemnt pointer receives 2 USD from an outgoing payment at a peer's Rafiki instance.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Peer Liquidity Acc.</th>
    <th>Wallet Address Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>2</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>2</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Cross currency

| Debit Account   | Credit Account   | Asset |
| --------------- | ---------------- | ----- |
| Peer Liquidity  | Asset Liquidity  | ABC   |
| Asset Liquidity | Incoming Payment | XYZ   |

- Example: A Rafiki instance receives 10 USD from a peer (peering relationship in USD) to be deposited in an incoming payment liquidity account denominated in EUR. The payment is converted to EUR and deposited.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Peer Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>10</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>10</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr class="header-row">
    <th>EUR (Asset) Liquidity Acc.</th>
    <th>Incoming Payment Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>9</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>9</td>
        </tr>
      </table>
    </td>
</tr>
</table>

###### SPSP / Web Monetization

| Debit Account   | Credit Account  | Asset |
| --------------- | --------------- | ----- |
| Peer Liquidity  | Asset Liquidity | ABC   |
| Asset Liquidity | Wallet Address | XYZ   |

- Example: A Rafiki instance receives 10 USD from a peer (peering relationship in USD) to be deposited in a wallet address liquidity account denominated in EUR. The payment is converted to EUR and deposited.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Peer Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>2</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>2</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr class="header-row">
    <th>EUR (Asset) Liquidity Acc.</th>
    <th>Wallet Address Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>1</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>1</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

#### Connector

##### Same asset

| Debit Account  | Credit Account |
| -------------- | -------------- |
| Peer Liquidity | Peer Liquidity |

- Example: Rafiki forwards 10 USD from peer A to peer B.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Peer A Liquidity Acc.</th>
    <th>Peer B Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>10</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>10</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

##### Cross currency

| Debit Account   | Credit Account  | Asset |
| --------------- | --------------- | ----- |
| Peer Liquidity  | Asset Liquidity | ABC   |
| Asset Liquidity | Peer Liquidity  | XYZ   |

- Example: Rafiki receives 100 USD from peer A and forwards 90 EUR to peer B.

<table class="accounting-table not-content">
  <tr class="header-row">
    <th>Peer A Liquidity Acc.</th>
    <th>USD (Asset) Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>100</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>100</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr class="header-row">
    <th>EUR (Asset) Liquidity Acc.</th>
    <th>Peer B Liquidity Acc.</th>
  </tr>
  <tr>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td>90</td><td></td>
        </tr>
      </table>
    </td>
    <td>
      <table>
        <tr>
          <th>Debit</th><th>Credit</th>
        </tr>
        <tr>
          <td></td><td>90</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
