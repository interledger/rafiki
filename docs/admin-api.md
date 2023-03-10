# Admin API

The Admin API is a GraphQL API. It allows [Account Servicing Entities'](./glossary.md#account-servicing-entity) admins to e.g.

- create [assets](./glossary.md#asset)
- create [peers](./glossary.md#peer)
- create [payment pointers](./glossary.md#payment-pointer)
- create [Open Payments](./glossary.md#open-payments) resources

<!-- START graphql-markdown -->

## Schema Types

<details>
  <summary><strong>Table of Contents</strong></summary>

- [Query](#query)
- [Mutation](#mutation)
- [Objects](#objects)
  - [Amount](#amount)
  - [Asset](#asset)
  - [AssetEdge](#assetedge)
  - [AssetMutationResponse](#assetmutationresponse)
  - [AssetsConnection](#assetsconnection)
  - [CreatePaymentPointerKeyMutationResponse](#createpaymentpointerkeymutationresponse)
  - [CreatePaymentPointerMutationResponse](#createpaymentpointermutationresponse)
  - [CreatePeerMutationResponse](#createpeermutationresponse)
  - [CreateReceiverResponse](#createreceiverresponse)
  - [DeletePeerMutationResponse](#deletepeermutationresponse)
  - [Http](#http)
  - [HttpOutgoing](#httpoutgoing)
  - [IncomingPayment](#incomingpayment)
  - [IncomingPaymentConnection](#incomingpaymentconnection)
  - [IncomingPaymentEdge](#incomingpaymentedge)
  - [IncomingPaymentResponse](#incomingpaymentresponse)
  - [Jwk](#jwk)
  - [LiquidityMutationResponse](#liquiditymutationresponse)
  - [OutgoingPayment](#outgoingpayment)
  - [OutgoingPaymentConnection](#outgoingpaymentconnection)
  - [OutgoingPaymentEdge](#outgoingpaymentedge)
  - [OutgoingPaymentResponse](#outgoingpaymentresponse)
  - [PageInfo](#pageinfo)
  - [PaymentPointer](#paymentpointer)
  - [PaymentPointerKey](#paymentpointerkey)
  - [PaymentPointerWithdrawal](#paymentpointerwithdrawal)
  - [PaymentPointerWithdrawalMutationResponse](#paymentpointerwithdrawalmutationresponse)
  - [Peer](#peer)
  - [PeerEdge](#peeredge)
  - [PeersConnection](#peersconnection)
  - [Quote](#quote)
  - [QuoteConnection](#quoteconnection)
  - [QuoteEdge](#quoteedge)
  - [QuoteResponse](#quoteresponse)
  - [Receiver](#receiver)
  - [RevokePaymentPointerKeyMutationResponse](#revokepaymentpointerkeymutationresponse)
  - [TransferMutationResponse](#transfermutationresponse)
  - [TriggerPaymentPointerEventsMutationResponse](#triggerpaymentpointereventsmutationresponse)
  - [UpdatePeerMutationResponse](#updatepeermutationresponse)
- [Inputs](#inputs)
  - [AddAssetLiquidityInput](#addassetliquidityinput)
  - [AddPeerLiquidityInput](#addpeerliquidityinput)
  - [AmountInput](#amountinput)
  - [AssetInput](#assetinput)
  - [CreateAssetInput](#createassetinput)
  - [CreateAssetLiquidityWithdrawalInput](#createassetliquiditywithdrawalinput)
  - [CreateIncomingPaymentInput](#createincomingpaymentinput)
  - [CreateOutgoingPaymentInput](#createoutgoingpaymentinput)
  - [CreatePaymentPointerInput](#createpaymentpointerinput)
  - [CreatePaymentPointerKeyInput](#createpaymentpointerkeyinput)
  - [CreatePaymentPointerWithdrawalInput](#createpaymentpointerwithdrawalinput)
  - [CreatePeerInput](#createpeerinput)
  - [CreatePeerLiquidityWithdrawalInput](#createpeerliquiditywithdrawalinput)
  - [CreateQuoteInput](#createquoteinput)
  - [CreateReceiverInput](#createreceiverinput)
  - [HttpIncomingInput](#httpincominginput)
  - [HttpInput](#httpinput)
  - [HttpOutgoingInput](#httpoutgoinginput)
  - [JwkInput](#jwkinput)
  - [UpdateAssetInput](#updateassetinput)
  - [UpdatePeerInput](#updatepeerinput)
- [Enums](#enums)
  - [Alg](#alg)
  - [Crv](#crv)
  - [IncomingPaymentState](#incomingpaymentstate)
  - [Kty](#kty)
  - [LiquidityError](#liquidityerror)
  - [OutgoingPaymentState](#outgoingpaymentstate)
- [Scalars](#scalars)
  - [Boolean](#boolean)
  - [Float](#float)
  - [ID](#id)
  - [Int](#int)
  - [String](#string)
  - [UInt64](#uint64)
  - [UInt8](#uint8)
- [Interfaces](#interfaces)
  - [Model](#model)
  - [MutationResponse](#mutationresponse)

</details>

### Query

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>asset</strong></td>
<td valign="top"><a href="#asset">Asset</a></td>
<td>

Fetch an asset

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assets</strong></td>
<td valign="top"><a href="#assetsconnection">AssetsConnection</a>!</td>
<td>

Fetch a page of assets.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">after</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating forwards: the cursor before the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">before</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating backwards: the cursor after the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">first</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating forwards: The first **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">last</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating backwards: The last **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>peer</strong></td>
<td valign="top"><a href="#peer">Peer</a></td>
<td>

Fetch a peer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>peers</strong></td>
<td valign="top"><a href="#peersconnection">PeersConnection</a>!</td>
<td>

Fetch a page of peers.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">after</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating forwards: the cursor before the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">before</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating backwards: the cursor after the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">first</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating forwards: The first **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">last</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating backwards: The last **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointer</strong></td>
<td valign="top"><a href="#paymentpointer">PaymentPointer</a></td>
<td>

Fetch a payment pointer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>quote</strong></td>
<td valign="top"><a href="#quote">Quote</a></td>
<td>

Fetch an Open Payments quote

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>outgoingPayment</strong></td>
<td valign="top"><a href="#outgoingpayment">OutgoingPayment</a></td>
<td>

Fetch an Open Payments outgoing payment

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

### Mutation

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>createAsset</strong></td>
<td valign="top"><a href="#assetmutationresponse">AssetMutationResponse</a>!</td>
<td>

Create an asset

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createassetinput">CreateAssetInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>updateAssetWithdrawalThreshold</strong></td>
<td valign="top"><a href="#assetmutationresponse">AssetMutationResponse</a>!</td>
<td>

Update an asset's withdrawal threshold. The withdrawal threshold indicates the MINIMUM amount that can be withdrawn.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#updateassetinput">UpdateAssetInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>addAssetLiquidity</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Add asset liquidity

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#addassetliquidityinput">AddAssetLiquidityInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createAssetLiquidityWithdrawal</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Withdraw asset liquidity

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createassetliquiditywithdrawalinput">CreateAssetLiquidityWithdrawalInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createPeer</strong></td>
<td valign="top"><a href="#createpeermutationresponse">CreatePeerMutationResponse</a>!</td>
<td>

Create a peer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpeerinput">CreatePeerInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>updatePeer</strong></td>
<td valign="top"><a href="#updatepeermutationresponse">UpdatePeerMutationResponse</a>!</td>
<td>

Update a peer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#updatepeerinput">UpdatePeerInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>deletePeer</strong></td>
<td valign="top"><a href="#deletepeermutationresponse">DeletePeerMutationResponse</a>!</td>
<td>

Delete a peer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>addPeerLiquidity</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Add peer liquidity

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#addpeerliquidityinput">AddPeerLiquidityInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createPeerLiquidityWithdrawal</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Withdraw peer liquidity

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpeerliquiditywithdrawalinput">CreatePeerLiquidityWithdrawalInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>postLiquidityWithdrawal</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Post liquidity withdrawal. Withdrawals are two-phase commits and are committed via this mutation.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">withdrawalId</td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the liquidity withdrawal to post.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>voidLiquidityWithdrawal</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Void liquidity withdrawal. Withdrawals are two-phase commits and are rolled back via this mutation.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">withdrawalId</td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the liquidity withdrawal to void.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createPaymentPointer</strong></td>
<td valign="top"><a href="#createpaymentpointermutationresponse">CreatePaymentPointerMutationResponse</a>!</td>
<td>

Create a payment pointer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpaymentpointerinput">CreatePaymentPointerInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createPaymentPointerKey</strong></td>
<td valign="top"><a href="#createpaymentpointerkeymutationresponse">CreatePaymentPointerKeyMutationResponse</a></td>
<td>

Add a public key to a payment pointer that is used to verify Open Payments requests.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpaymentpointerkeyinput">CreatePaymentPointerKeyInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>revokePaymentPointerKey</strong></td>
<td valign="top"><a href="#revokepaymentpointerkeymutationresponse">RevokePaymentPointerKeyMutationResponse</a></td>
<td>

Revoke a public key associated with a payment pointer. Open Payment requests using this key for request signatures will be denied going forward.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Internal id of key

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createIncomingPayment</strong></td>
<td valign="top"><a href="#incomingpaymentresponse">IncomingPaymentResponse</a>!</td>
<td>

Create an internal Open Payments Incoming Payment. The receiver has a payment pointer on this Rafiki instance.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createincomingpaymentinput">CreateIncomingPaymentInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createReceiver</strong></td>
<td valign="top"><a href="#createreceiverresponse">CreateReceiverResponse</a>!</td>
<td>

Create an internal or external Open Payments Incoming Payment. The receiver has a payment pointer on either this or another Rafiki instance.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createreceiverinput">CreateReceiverInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createQuote</strong></td>
<td valign="top"><a href="#quoteresponse">QuoteResponse</a>!</td>
<td>

Create an Open Payments Quote

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createquoteinput">CreateQuoteInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createOutgoingPayment</strong></td>
<td valign="top"><a href="#outgoingpaymentresponse">OutgoingPaymentResponse</a>!</td>
<td>

Create an Open Payments Outgoing Payment

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createoutgoingpaymentinput">CreateOutgoingPaymentInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>depositEventLiquidity</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Deposit webhook event liquidity

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">eventId</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawEventLiquidity</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Withdraw webhook event liquidity

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">eventId</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createPaymentPointerWithdrawal</strong></td>
<td valign="top"><a href="#paymentpointerwithdrawalmutationresponse">PaymentPointerWithdrawalMutationResponse</a></td>
<td>

Withdraw liquidity from a payment pointer received via Web Monetization.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpaymentpointerwithdrawalinput">CreatePaymentPointerWithdrawalInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>triggerPaymentPointerEvents</strong></td>
<td valign="top"><a href="#triggerpaymentpointereventsmutationresponse">TriggerPaymentPointerEventsMutationResponse</a>!</td>
<td>

If automatic withdrawal of funds received via Web Monetization by the payment pointer are disabled, this mutation can be used to trigger up to n withdrawal events.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">limit</td>
<td valign="top"><a href="#int">Int</a>!</td>
<td>

Maximum number of events being triggered (n).

</td>
</tr>
</tbody>
</table>

### Objects

#### Amount

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>value</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetCode</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

[ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD`

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetScale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td>

Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit

</td>
</tr>
</tbody>
</table>

#### Asset

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Asset id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

[ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD`

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>scale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td>

Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawalThreshold</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td>

Minimum amount of liquidity that can be withdrawn from the asset

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
</tbody>
</table>

#### AssetEdge

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>node</strong></td>
<td valign="top"><a href="#asset">Asset</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>cursor</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### AssetMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>asset</strong></td>
<td valign="top"><a href="#asset">Asset</a></td>
<td></td>
</tr>
</tbody>
</table>

#### AssetsConnection

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>pageInfo</strong></td>
<td valign="top"><a href="#pageinfo">PageInfo</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>edges</strong></td>
<td valign="top">[<a href="#assetedge">AssetEdge</a>!]!</td>
<td></td>
</tr>
</tbody>
</table>

#### CreatePaymentPointerKeyMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerKey</strong></td>
<td valign="top"><a href="#paymentpointerkey">PaymentPointerKey</a></td>
<td></td>
</tr>
</tbody>
</table>

#### CreatePaymentPointerMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointer</strong></td>
<td valign="top"><a href="#paymentpointer">PaymentPointer</a></td>
<td></td>
</tr>
</tbody>
</table>

#### CreatePeerMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>peer</strong></td>
<td valign="top"><a href="#peer">Peer</a></td>
<td></td>
</tr>
</tbody>
</table>

#### CreateReceiverResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#receiver">Receiver</a></td>
<td></td>
</tr>
</tbody>
</table>

#### DeletePeerMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### Http

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>outgoing</strong></td>
<td valign="top"><a href="#httpoutgoing">HttpOutgoing</a>!</td>
<td>

Outgoing connection details

</td>
</tr>
</tbody>
</table>

#### HttpOutgoing

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>authToken</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Auth token to present at the peering Rafiki instance

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>endpoint</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Peer's connection endpoint

</td>
</tr>
</tbody>
</table>

#### IncomingPayment

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Incoming Payment id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Id of the payment pointer under which this incoming payment was created

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>state</strong></td>
<td valign="top"><a href="#incomingpaymentstate">IncomingPaymentState</a>!</td>
<td>

Incoming payment state

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of expiry. After this time, the incoming payment will not accept further payments made to it.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a></td>
<td>

The maximum amount that should be paid into the payment pointer under this incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receivedAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td>

The total amount that has been paid into the payment pointer under this incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Human readable description of the incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

A reference that can be used by external systems to reconcile this payment with their systems. E.g. an invoice number.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
</tbody>
</table>

#### IncomingPaymentConnection

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>pageInfo</strong></td>
<td valign="top"><a href="#pageinfo">PageInfo</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>edges</strong></td>
<td valign="top">[<a href="#incomingpaymentedge">IncomingPaymentEdge</a>!]!</td>
<td></td>
</tr>
</tbody>
</table>

#### IncomingPaymentEdge

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>node</strong></td>
<td valign="top"><a href="#incomingpayment">IncomingPayment</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>cursor</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### IncomingPaymentResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>payment</strong></td>
<td valign="top"><a href="#incomingpayment">IncomingPayment</a></td>
<td></td>
</tr>
</tbody>
</table>

#### Jwk

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>kid</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Key id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>x</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Base64 url-encoded public key.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>alg</strong></td>
<td valign="top"><a href="#alg">Alg</a>!</td>
<td>

Cryptographic algorithm family used with the key. The only allowed value is `EdDSA`.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>kty</strong></td>
<td valign="top"><a href="#kty">Kty</a>!</td>
<td>

Key type. The only allowed value is `OKP`.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>crv</strong></td>
<td valign="top"><a href="#crv">Crv</a>!</td>
<td>

Curve that the key pair is derived from. The only allowed value is `Ed25519`.

</td>
</tr>
</tbody>
</table>

#### LiquidityMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>error</strong></td>
<td valign="top"><a href="#liquidityerror">LiquidityError</a></td>
<td></td>
</tr>
</tbody>
</table>

#### OutgoingPayment

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Outgoing payment id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Id of the payment pointer under which this outgoing payment was created

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>state</strong></td>
<td valign="top"><a href="#outgoingpaymentstate">OutgoingPaymentState</a>!</td>
<td>

Outgoing payment state

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>error</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>stateAttempts</strong></td>
<td valign="top"><a href="#int">Int</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>sendAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td>

Amount to send (fixed send)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiveAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td>

Amount to receive (fixed receive)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Payment pointer URL of the receiver

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Human readable description of the outgoing payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

A reference that can be used by external systems to reconcile this payment with their systems. E.g. an invoice number.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>quote</strong></td>
<td valign="top"><a href="#quote">Quote</a></td>
<td>

Quote for this outgoing payment

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>sentAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td>

Amount already sent

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
</tbody>
</table>

#### OutgoingPaymentConnection

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>pageInfo</strong></td>
<td valign="top"><a href="#pageinfo">PageInfo</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>edges</strong></td>
<td valign="top">[<a href="#outgoingpaymentedge">OutgoingPaymentEdge</a>!]!</td>
<td></td>
</tr>
</tbody>
</table>

#### OutgoingPaymentEdge

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>node</strong></td>
<td valign="top"><a href="#outgoingpayment">OutgoingPayment</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>cursor</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### OutgoingPaymentResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>payment</strong></td>
<td valign="top"><a href="#outgoingpayment">OutgoingPayment</a></td>
<td></td>
</tr>
</tbody>
</table>

#### PageInfo

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>endCursor</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating forwards: the cursor to continue.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>hasNextPage</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td>

Paginating forwards: Are there more pages?

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>hasPreviousPage</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td>

Paginating backwards: Are there more pages?

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>startCursor</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating backwards: the cursor to continue.

</td>
</tr>
</tbody>
</table>

#### PaymentPointer

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Payment pointer id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>asset</strong></td>
<td valign="top"><a href="#asset">Asset</a>!</td>
<td>

Asset of the payment pointer

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>url</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Payment Pointer URL

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>publicName</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Public name associated with the payment pointer

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingPayments</strong></td>
<td valign="top"><a href="#incomingpaymentconnection">IncomingPaymentConnection</a></td>
<td>

List of incoming payments received by this payment pointer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">after</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating forwards: the cursor before the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">before</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating backwards: the cursor after the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">first</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating forwards: The first **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">last</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating backwards: The last **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>quotes</strong></td>
<td valign="top"><a href="#quoteconnection">QuoteConnection</a></td>
<td>

List of quotes created at this payment pointer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">after</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating forwards: the cursor before the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">before</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating backwards: the cursor after the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">first</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating forwards: The first **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">last</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating backwards: The last **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>outgoingPayments</strong></td>
<td valign="top"><a href="#outgoingpaymentconnection">OutgoingPaymentConnection</a></td>
<td>

List of outgoing payments sent from this payment pointer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">after</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating forwards: the cursor before the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">before</td>
<td valign="top"><a href="#string">String</a></td>
<td>

Paginating backwards: the cursor after the the requested page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">first</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating forwards: The first **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">last</td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Paginating backwards: The last **n** elements from the page.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
</tbody>
</table>

#### PaymentPointerKey

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Internal id of key

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Id of the payment pointer to which this key belongs to

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>jwk</strong></td>
<td valign="top"><a href="#jwk">Jwk</a>!</td>
<td>

Public key

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>revoked</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td>

Indicator whether the key has been revoked

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
</tbody>
</table>

#### PaymentPointerWithdrawal

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Withdrawal Id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>amount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td>

Amount to withdraw

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointer</strong></td>
<td valign="top"><a href="#paymentpointer">PaymentPointer</a>!</td>
<td>

Payment pointer details

</td>
</tr>
</tbody>
</table>

#### PaymentPointerWithdrawalMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>error</strong></td>
<td valign="top"><a href="#liquidityerror">LiquidityError</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawal</strong></td>
<td valign="top"><a href="#paymentpointerwithdrawal">PaymentPointerWithdrawal</a></td>
<td></td>
</tr>
</tbody>
</table>

#### Peer

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Peer id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>maxPacketAmount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td>

Maximum packet amount that the peer accepts

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>http</strong></td>
<td valign="top"><a href="#http">Http</a>!</td>
<td>

Peering connection details

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>asset</strong></td>
<td valign="top"><a href="#asset">Asset</a>!</td>
<td>

Asset of peering relationship

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>staticIlpAddress</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Peer's ILP address

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>name</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Peer's public name

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
</tbody>
</table>

#### PeerEdge

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>node</strong></td>
<td valign="top"><a href="#peer">Peer</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>cursor</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### PeersConnection

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>pageInfo</strong></td>
<td valign="top"><a href="#pageinfo">PageInfo</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>edges</strong></td>
<td valign="top">[<a href="#peeredge">PeerEdge</a>!]!</td>
<td></td>
</tr>
</tbody>
</table>

#### Quote

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Quote id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td>

Id of the payment pointer under which this quote was created

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Payment pointer URL of the receiver

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>sendAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td>

Amount to send (fixed send)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiveAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td>

Amount to receive (fixed receive)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>maxPacketAmount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td>

Maximum value per packet allowed on the possible routes

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>minExchangeRate</strong></td>
<td valign="top"><a href="#float">Float</a>!</td>
<td>

Aggregate exchange rate the payment is guaranteed to meet

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>lowEstimatedExchangeRate</strong></td>
<td valign="top"><a href="#float">Float</a>!</td>
<td>

Lower bound of probed exchange rate

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>highEstimatedExchangeRate</strong></td>
<td valign="top"><a href="#float">Float</a>!</td>
<td>

Upper bound of probed exchange rate

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of expiration

</td>
</tr>
</tbody>
</table>

#### QuoteConnection

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>pageInfo</strong></td>
<td valign="top"><a href="#pageinfo">PageInfo</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>edges</strong></td>
<td valign="top">[<a href="#quoteedge">QuoteEdge</a>!]!</td>
<td></td>
</tr>
</tbody>
</table>

#### QuoteEdge

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>node</strong></td>
<td valign="top"><a href="#quote">Quote</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>cursor</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### QuoteResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>quote</strong></td>
<td valign="top"><a href="#quote">Quote</a></td>
<td></td>
</tr>
</tbody>
</table>

#### Receiver

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Incoming payment URL

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerUrl</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Payment pointer URL under which the incoming payment was created

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>completed</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td>

Describes whether the incoming payment has completed receiving funds.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a></td>
<td>

The maximum amount that should be paid into the payment pointer under this incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receivedAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td>

The total amount that has been paid into the payment pointer under this incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Date-time of expiry. After this time, the incoming payment will accept further payments made to it.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Human readable description of the incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

A reference that can be used by external systems to reconcile this payment with their systems. E.g. an invoice number.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of creation

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>updatedAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Date-time of last update

</td>
</tr>
</tbody>
</table>

#### RevokePaymentPointerKeyMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerKey</strong></td>
<td valign="top"><a href="#paymentpointerkey">PaymentPointerKey</a></td>
<td></td>
</tr>
</tbody>
</table>

#### TransferMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### TriggerPaymentPointerEventsMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>count</strong></td>
<td valign="top"><a href="#int">Int</a></td>
<td>

Number of events triggered

</td>
</tr>
</tbody>
</table>

#### UpdatePeerMutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>peer</strong></td>
<td valign="top"><a href="#peer">Peer</a></td>
<td></td>
</tr>
</tbody>
</table>

### Inputs

#### AddAssetLiquidityInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>assetId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the asset to add liquidity.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>amount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td>

Amount of liquidity to add.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the transfer.

</td>
</tr>
</tbody>
</table>

#### AddPeerLiquidityInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>peerId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the peer to add liquidity.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>amount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td>

Amount of liquidity to add.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the transfer.

</td>
</tr>
</tbody>
</table>

#### AmountInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>value</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetCode</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

[ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD`

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetScale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td>

Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit

</td>
</tr>
</tbody>
</table>

#### AssetInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

[ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD`

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>scale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td>

Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit

</td>
</tr>
</tbody>
</table>

#### CreateAssetInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

[ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD`

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>scale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td>

Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawalThreshold</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td>

Minimum amount of liquidity that can be withdrawn from the asset

</td>
</tr>
</tbody>
</table>

#### CreateAssetLiquidityWithdrawalInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>assetId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the asset to create the withdrawal for.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>amount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td>

Amount of withdrawal.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the withdrawal.

</td>
</tr>
</tbody>
</table>

#### CreateIncomingPaymentInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Id of the payment pointer under which the incoming payment will be created

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Expiration date-time

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Human readable description of the incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td>

Maximum amount to be received

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

A reference that can be used by external systems to reconcile this payment with their systems. E.g. an invoice number.

</td>
</tr>
</tbody>
</table>

#### CreateOutgoingPaymentInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Id of the payment pointer under which the outgoing payment will be created

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>quoteId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Id of the corresponding quote for that outgoing payment

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Human readable description of the outgoing payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

A reference that can be used by external systems to reconcile this payment with their systems. E.g. an invoice number.

</td>
</tr>
</tbody>
</table>

#### CreatePaymentPointerInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>assetId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Asset of the payment pointer

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>url</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Payment Pointer URL

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>publicName</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Public name associated with the payment pointer

</td>
</tr>
</tbody>
</table>

#### CreatePaymentPointerKeyInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>jwk</strong></td>
<td valign="top"><a href="#jwkinput">JwkInput</a>!</td>
<td>

Public key

</td>
</tr>
</tbody>
</table>

#### CreatePaymentPointerWithdrawalInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the Open Payments payment pointer to create the withdrawal for.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the withdrawal.

</td>
</tr>
</tbody>
</table>

#### CreatePeerInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>maxPacketAmount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td>

Maximum packet amount that the peer accepts

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>http</strong></td>
<td valign="top"><a href="#httpinput">HttpInput</a>!</td>
<td>

Peering connection details

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Asset id of peering relationship

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>staticIlpAddress</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Peer's ILP address

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>name</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Peer's internal name

</td>
</tr>
</tbody>
</table>

#### CreatePeerLiquidityWithdrawalInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>peerId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the peer to create the withdrawal for.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>amount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td>

Amount of withdrawal.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

The id of the withdrawal.

</td>
</tr>
</tbody>
</table>

#### CreateQuoteInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Id of the payment pointer under which the quote will be created

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>sendAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td>

Amount to send (fixed send)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiveAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td>

Amount to receive (fixed receive)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Payment pointer URL of the receiver

</td>
</tr>
</tbody>
</table>

#### CreateReceiverInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerUrl</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Receiving payment pointer URL

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Expiration date-time

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Human readable description of the incoming payment.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td>

Maximum amount to be received

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

A reference that can be used by external systems to reconcile this payment with their systems. E.g. an invoice number.

</td>
</tr>
</tbody>
</table>

#### HttpIncomingInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>authTokens</strong></td>
<td valign="top">[<a href="#string">String</a>!]!</td>
<td>

Array of auth tokens accepted by this Rafiki instance

</td>
</tr>
</tbody>
</table>

#### HttpInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>incoming</strong></td>
<td valign="top"><a href="#httpincominginput">HttpIncomingInput</a></td>
<td>

Incoming connection details

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>outgoing</strong></td>
<td valign="top"><a href="#httpoutgoinginput">HttpOutgoingInput</a>!</td>
<td>

Outgoing connection details

</td>
</tr>
</tbody>
</table>

#### HttpOutgoingInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>authToken</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Auth token to present at the peering Rafiki instance

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>endpoint</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Peer's connection endpoint

</td>
</tr>
</tbody>
</table>

#### JwkInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>kid</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Key id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>x</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Base64 url-encoded public key.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>alg</strong></td>
<td valign="top"><a href="#alg">Alg</a>!</td>
<td>

Cryptographic algorithm family used with the key. The only allowed value is `EdDSA`.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>kty</strong></td>
<td valign="top"><a href="#kty">Kty</a>!</td>
<td>

Key type. The only allowed value is `OKP`.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>crv</strong></td>
<td valign="top"><a href="#crv">Crv</a>!</td>
<td>

Curve that the key pair is derived from. The only allowed value is `Ed25519`.

</td>
</tr>
</tbody>
</table>

#### UpdateAssetInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Asset id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawalThreshold</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td>

New minimum amount of liquidity that can be withdrawn from the asset

</td>
</tr>
</tbody>
</table>

#### UpdatePeerInput

<table>
<thead>
<tr>
<th colspan="2" align="left">Field</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Peer id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>maxPacketAmount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td>

New maximum packet amount that the peer accepts

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>http</strong></td>
<td valign="top"><a href="#httpinput">HttpInput</a></td>
<td>

New peering connection details

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>staticIlpAddress</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Peer's new ILP address

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>name</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Peer's new public name

</td>
</tr>
</tbody>
</table>

### Enums

#### Alg

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>EdDSA</strong></td>
<td></td>
</tr>
</tbody>
</table>

#### Crv

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>Ed25519</strong></td>
<td></td>
</tr>
</tbody>
</table>

#### IncomingPaymentState

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>PENDING</strong></td>
<td>

The payment has a state of PENDING when it is initially created.

</td>
</tr>
<tr>
<td valign="top"><strong>PROCESSING</strong></td>
<td>

As soon as payment has started (funds have cleared into the account) the state moves to PROCESSING

</td>
</tr>
<tr>
<td valign="top"><strong>COMPLETED</strong></td>
<td>

The payment is either auto-completed once the received amount equals the expected `incomingAmount`, or it is completed manually via an API call.

</td>
</tr>
<tr>
<td valign="top"><strong>EXPIRED</strong></td>
<td>

If the payment expires before it is completed then the state will move to EXPIRED and no further payments will be accepted.

</td>
</tr>
</tbody>
</table>

#### Kty

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>OKP</strong></td>
<td></td>
</tr>
</tbody>
</table>

#### LiquidityError

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>AlreadyPosted</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>AlreadyVoided</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>AmountZero</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>InsufficientBalance</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>InvalidId</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>TransferExists</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>UnknownAsset</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>UnknownIncomingPayment</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>UnknownPayment</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>UnknownPaymentPointer</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>UnknownPeer</strong></td>
<td></td>
</tr>
<tr>
<td valign="top"><strong>UnknownTransfer</strong></td>
<td></td>
</tr>
</tbody>
</table>

#### OutgoingPaymentState

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>FUNDING</strong></td>
<td>

Will transition to SENDING once payment funds are reserved

</td>
</tr>
<tr>
<td valign="top"><strong>SENDING</strong></td>
<td>

Paying, will transition to COMPLETED on success

</td>
</tr>
<tr>
<td valign="top"><strong>COMPLETED</strong></td>
<td>

Successful completion

</td>
</tr>
<tr>
<td valign="top"><strong>FAILED</strong></td>
<td>

Payment failed

</td>
</tr>
</tbody>
</table>

### Scalars

#### Boolean

The `Boolean` scalar type represents `true` or `false`.

#### Float

The `Float` scalar type represents signed double-precision fractional values as specified by [IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point).

#### ID

The `ID` scalar type represents a unique identifier, often used to refetch an object or as key for a cache. The ID type appears in a JSON response as a String; however, it is not intended to be human-readable. When expected as an input type, any string (such as `"4"`) or integer (such as `4`) input value will be accepted as an ID.

#### Int

The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.

#### String

The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text.

#### UInt64

#### UInt8

### Interfaces

#### Model

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>id</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

#### MutationResponse

<table>
<thead>
<tr>
<th align="left">Field</th>
<th align="right">Argument</th>
<th align="left">Type</th>
<th align="left">Description</th>
</tr>
</thead>
<tbody>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>success</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>message</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

<!-- END graphql-markdown -->
