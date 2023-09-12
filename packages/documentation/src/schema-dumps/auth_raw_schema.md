# Schema Types

<details>
  <summary><strong>Table of Contents</strong></summary>

- [Query](#query)
- [Mutation](#mutation)
- [Objects](#objects)
  - [Access](#access)
  - [Grant](#grant)
  - [GrantEdge](#grantedge)
  - [GrantsConnection](#grantsconnection)
  - [LimitData](#limitdata)
  - [PageInfo](#pageinfo)
  - [PaymentAmount](#paymentamount)
  - [RevokeGrantMutationResponse](#revokegrantmutationresponse)
- [Inputs](#inputs)
  - [FilterGrantState](#filtergrantstate)
  - [FilterString](#filterstring)
  - [GrantFilter](#grantfilter)
  - [RevokeGrantInput](#revokegrantinput)
- [Enums](#enums)
  - [GrantFinalization](#grantfinalization)
  - [GrantState](#grantstate)
- [Scalars](#scalars)
  - [Boolean](#boolean)
  - [ID](#id)
  - [Int](#int)
  - [String](#string)
  - [UInt64](#uint64)
  - [UInt8](#uint8)
- [Interfaces](#interfaces)
  - [Model](#model)
  - [MutationResponse](#mutationresponse)

</details>

## Query

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
<td colspan="2" valign="top"><strong>grants</strong></td>
<td valign="top"><a href="#grantsconnection">GrantsConnection</a>!</td>
<td>

Fetch a page of grants.

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
<td colspan="2" align="right" valign="top">filter</td>
<td valign="top"><a href="#grantfilter">GrantFilter</a></td>
<td>

Filter grants based on specific criteria.

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>grant</strong></td>
<td valign="top"><a href="#grant">Grant</a>!</td>
<td>

Fetch a grant

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">id</td>
<td valign="top"><a href="#id">ID</a>!</td>
<td></td>
</tr>
</tbody>
</table>

## Mutation

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
<td colspan="2" valign="top"><strong>revokeGrant</strong></td>
<td valign="top"><a href="#revokegrantmutationresponse">RevokeGrantMutationResponse</a>!</td>
<td>

Revoke Grant

</td>
</tr>
<tr>
<td colspan="2" align="right" valign="top">input</td>
<td valign="top"><a href="#revokegrantinput">RevokeGrantInput</a>!</td>
<td></td>
</tr>
</tbody>
</table>

## Objects

### Access

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

Access id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>identifier</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Payment pointer of a sub-resource (incoming payment, outgoing payment, or quote)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>type</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Access type (incoming payment, outgoing payment, or quote)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>actions</strong></td>
<td valign="top">[<a href="#string">String</a>]!</td>
<td>

Access action (create, read, list or complete)

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>limits</strong></td>
<td valign="top"><a href="#limitdata">LimitData</a></td>
<td>

Payment limits

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

### Grant

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

Grant id

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>client</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td>

Payment pointer of the grantee's account

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>access</strong></td>
<td valign="top">[<a href="#access">Access</a>!]!</td>
<td>

Access details

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>state</strong></td>
<td valign="top"><a href="#grantstate">GrantState</a>!</td>
<td>

State of the grant

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>finalizationReason</strong></td>
<td valign="top"><a href="#grantfinalization">GrantFinalization</a></td>
<td>

Reason a grant was finalized

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

### GrantEdge

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
<td valign="top"><a href="#grant">Grant</a>!</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>cursor</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

### GrantsConnection

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
<td valign="top">[<a href="#grantedge">GrantEdge</a>!]!</td>
<td></td>
</tr>
</tbody>
</table>

### LimitData

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
<td colspan="2" valign="top"><strong>receiver</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Payment pointer URL of the receiver

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>debitAmount</strong></td>
<td valign="top"><a href="#paymentamount">PaymentAmount</a></td>
<td>

Amount to debit

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>receiveAmount</strong></td>
<td valign="top"><a href="#paymentamount">PaymentAmount</a></td>
<td>

Amount to receive

</td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>interval</strong></td>
<td valign="top"><a href="#string">String</a></td>
<td>

Interval between payments

</td>
</tr>
</tbody>
</table>

### PageInfo

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

### PaymentAmount

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

### RevokeGrantMutationResponse

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

## Inputs

### FilterGrantState

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
<td colspan="2" valign="top"><strong>in</strong></td>
<td valign="top">[<a href="#grantstate">GrantState</a>!]</td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>notIn</strong></td>
<td valign="top">[<a href="#grantstate">GrantState</a>!]</td>
<td></td>
</tr>
</tbody>
</table>

### FilterString

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
<td colspan="2" valign="top"><strong>in</strong></td>
<td valign="top">[<a href="#string">String</a>!]</td>
<td></td>
</tr>
</tbody>
</table>

### GrantFilter

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
<td colspan="2" valign="top"><strong>identifier</strong></td>
<td valign="top"><a href="#filterstring">FilterString</a></td>
<td></td>
</tr>
<tr>
<td colspan="2" valign="top"><strong>state</strong></td>
<td valign="top"><a href="#filtergrantstate">FilterGrantState</a></td>
<td></td>
</tr>
</tbody>
</table>

### RevokeGrantInput

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
<td colspan="2" valign="top"><strong>grantId</strong></td>
<td valign="top"><a href="#string">String</a>!</td>
<td></td>
</tr>
</tbody>
</table>

## Enums

### GrantFinalization

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>ISSUED</strong></td>
<td>

grant was issued

</td>
</tr>
<tr>
<td valign="top"><strong>REVOKED</strong></td>
<td>

grant was revoked

</td>
</tr>
<tr>
<td valign="top"><strong>REJECTED</strong></td>
<td>

grant was rejected

</td>
</tr>
</tbody>
</table>

### GrantState

<table>
<thead>
<th align="left">Value</th>
<th align="left">Description</th>
</thead>
<tbody>
<tr>
<td valign="top"><strong>PROCESSING</strong></td>
<td>

grant request is determining what state to enter next

</td>
</tr>
<tr>
<td valign="top"><strong>PENDING</strong></td>
<td>

grant request is awaiting interaction

</td>
</tr>
<tr>
<td valign="top"><strong>APPROVED</strong></td>
<td>

grant was approved

</td>
</tr>
<tr>
<td valign="top"><strong>FINALIZED</strong></td>
<td>

grant was finalized and no more access tokens or interactions can be made on it

</td>
</tr>
</tbody>
</table>

## Scalars

### Boolean

The `Boolean` scalar type represents `true` or `false`.

### ID

The `ID` scalar type represents a unique identifier, often used to refetch an object or as key for a cache. The ID type appears in a JSON response as a String; however, it is not intended to be human-readable. When expected as an input type, any string (such as `"4"`) or integer (such as `4`) input value will be accepted as an ID.

### Int

The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.

### String

The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text.

### UInt64

### UInt8

## Interfaces

### Model

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

### MutationResponse

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
