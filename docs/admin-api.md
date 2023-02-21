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
<td colspan="2" valign="top"><strong>createPaymentPointer</strong></td>
<td valign="top"><a href="#createpaymentpointermutationresponse">CreatePaymentPointerMutationResponse</a>!</td>
<td>

Create payment pointer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpaymentpointerinput">CreatePaymentPointerInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>triggerPaymentPointerEvents</strong></td>
<td valign="top"><a href="#triggerpaymentpointereventsmutationresponse">TriggerPaymentPointerEventsMutationResponse</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">limit</td>
<td valign="top"><a href="#int">Int</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createAsset</strong></td>
<td valign="top"><a href="#assetmutationresponse">AssetMutationResponse</a>!</td>
<td>

Create asset

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

Update asset withdrawal threshold

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#updateassetinput">UpdateAssetInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createPeer</strong></td>
<td valign="top"><a href="#createpeermutationresponse">CreatePeerMutationResponse</a>!</td>
<td>

Create peer

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

Update peer

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

Delete peer

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
<td colspan="2" valign="top"><strong>createPeerLiquidityWithdrawal</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Create liquidity withdrawal from peer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpeerliquiditywithdrawalinput">CreatePeerLiquidityWithdrawalInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createAssetLiquidityWithdrawal</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Create liquidity withdrawal from asset

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createassetliquiditywithdrawalinput">CreateAssetLiquidityWithdrawalInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createPaymentPointerWithdrawal</strong></td>
<td valign="top"><a href="#paymentpointerwithdrawalmutationresponse">PaymentPointerWithdrawalMutationResponse</a></td>
<td>

Create liquidity withdrawal from Open Payments payment pointer

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createpaymentpointerwithdrawalinput">CreatePaymentPointerWithdrawalInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>postLiquidityWithdrawal</strong></td>
<td valign="top"><a href="#liquiditymutationresponse">LiquidityMutationResponse</a></td>
<td>

Posts liquidity withdrawal

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

Void liquidity withdrawal

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
<td colspan="2" valign="top"><strong>createIncomingPayment</strong></td>
<td valign="top"><a href="#incomingpaymentresponse">IncomingPaymentResponse</a>!</td>
<td>

Create an internal Open Payments Incoming Payment

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

Create an external Open Payments Incoming Payment

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#createreceiverinput">CreateReceiverInput</a>!</td>
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
<td colspan="2" valign="top"><strong>createPaymentPointerKey</strong></td>
<td valign="top"><a href="#createpaymentpointerkeymutationresponse">CreatePaymentPointerKeyMutationResponse</a></td>
<td>

Create payment pointer key

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

Revoke request signing key

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetScale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>code</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>scale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawalThreshold</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>endpoint</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>state</strong></td>
<td valign="top"><a href="#incomingpaymentstate">IncomingPaymentState</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receivedAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>x</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>alg</strong></td>
<td valign="top"><a href="#alg">Alg</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>kty</strong></td>
<td valign="top"><a href="#kty">Kty</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>crv</strong></td>
<td valign="top"><a href="#crv">Crv</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>state</strong></td>
<td valign="top"><a href="#outgoingpaymentstate">OutgoingPaymentState</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiveAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>quote</strong></td>
<td valign="top"><a href="#quote">Quote</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>sentAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>asset</strong></td>
<td valign="top"><a href="#asset">Asset</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>url</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>publicName</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingPayments</strong></td>
<td valign="top"><a href="#incomingpaymentconnection">IncomingPaymentConnection</a></td>
<td></td>
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
<td></td>
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
<td></td>
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
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>jwk</strong></td>
<td valign="top"><a href="#jwk">Jwk</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>revoked</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>amount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointer</strong></td>
<td valign="top"><a href="#paymentpointer">PaymentPointer</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>maxPacketAmount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>http</strong></td>
<td valign="top"><a href="#http">Http</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>asset</strong></td>
<td valign="top"><a href="#asset">Asset</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>staticIlpAddress</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>name</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerId</strong></td>
<td valign="top"><a href="#id">ID</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>sendAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiveAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>maxPacketAmount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>minExchangeRate</strong></td>
<td valign="top"><a href="#float">Float</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>lowEstimatedExchangeRate</strong></td>
<td valign="top"><a href="#float">Float</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>highEstimatedExchangeRate</strong></td>
<td valign="top"><a href="#float">Float</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>paymentPointerUrl</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>completed</strong></td>
<td valign="top"><a href="#boolean">Boolean</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receivedAmount</strong></td>
<td valign="top"><a href="#amount">Amount</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>createdAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>updatedAt</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetScale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a></td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>scale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>scale</strong></td>
<td valign="top"><a href="#uint8">UInt8</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawalThreshold</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>quoteId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>url</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>publicName</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
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
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>http</strong></td>
<td valign="top"><a href="#httpinput">HttpInput</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>assetId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>staticIlpAddress</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>name</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>sendAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiveAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>expiresAt</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>description</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>incomingAmount</strong></td>
<td valign="top"><a href="#amountinput">AmountInput</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>externalRef</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
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
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>outgoing</strong></td>
<td valign="top"><a href="#httpoutgoinginput">HttpOutgoingInput</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>endpoint</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>x</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>alg</strong></td>
<td valign="top"><a href="#alg">Alg</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>kty</strong></td>
<td valign="top"><a href="#kty">Kty</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>crv</strong></td>
<td valign="top"><a href="#crv">Crv</a>!</td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>withdrawalThreshold</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td></td>
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
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>maxPacketAmount</strong></td>
<td valign="top"><a href="#uint64">UInt64</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>http</strong></td>
<td valign="top"><a href="#httpinput">HttpInput</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>staticIlpAddress</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>name</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td></td>
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
