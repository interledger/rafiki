# Interledger Payment Request (IPR)

# OUTDATED Needs to be updated
See [Update Account Interledger Payment Request](https://github.com/interledger/rafiki/issues/551)

- [Interledger Payment Request (IPR)](#interledger-payment-request-ipr)
- [Overview](#overview)
  - [Glossary](#glossary)
  - [Flow](#flow)
- [Interledger payment request](#interledger-payment-request)
  - [Motivation](#motivation)
  - [Encodings](#encodings)
  - [Query string encoding](#query-string-encoding)
  - [Payment parameters](#payment-parameters)
    - [Fields](#fields)
    * [JavaScript object serialization](#javascript-object-serialization)
  - [Executing payments](#executing-payments)
    - [Open Payments invoice](#open-payments-invoice)
    - [Payment pointer](#payment-pointer)
    - [Fixed-delivery payments](#fixed-delivery-payments)
    - [Discretionary payments](#discretionary-payments)
    - [Recurring, discretionary payments](#recurring-discretionary-payments)
    - [Recurring, fixed-delivery payments](#recurring-fixed-delivery-payments)
- [Interledger payment outcome](#interledger-payment-outcome) - [Fields](#fields-1)
  - [JavaScript object serialization](#javascript-object-serialization-1)
- [Web-based discovery](#web-based-discovery)
  - [Mediator overview](#mediator-overview)
- [Initiator client spec](#initiator-client-spec)
  - [Choosing the flow](#choosing-the-flow)
  - [Hosting a payment app](#hosting-a-payment-app)
  - [Mediated flow](#mediated-flow)
    - [Mediator explanation](#mediator-explanation)
    - [Guide](#guide)
  - [`PaymentRequest` flow](#paymentrequest-flow)
    - [Payment handler overview](#payment-handler-overview)
    - [Payment app aggregators](#payment-app-aggregators)
    - [Payment method manifest](#payment-method-manifest)
- [Authorization portal spec](#authorization-portal-spec)
  - [Payment instrument service worker](#payment-instrument-service-worker)
  - [Payment app manifest](#payment-app-manifest)
    - [Custom Fields](#custom-fields)
  - [Authorization portal](#authorization-portal)
    - [Authentication](#authentication)
    - [Registration with mediator](#registration-with-mediator)
  - [Security model](#security-model)
    - [Payment pointers and accounts](#payment-pointers-and-accounts)
    - [Client-side vulnerabilities](#client-side-vulnerabilities)
    - [Hijacked mediator](#hijacked-mediator)
    - [Replay attacks](#replay-attacks)
  - [Privacy model](#privacy-model)
    - [Linking recipients to public identities](#linking-recipients-to-public-identities)
    - [Hiding payment details from mediator](#hiding-payment-details-from-mediator)
    - [Wallet privacy](#wallet-privacy)
  - [Threat model](#threat-model)
    - [Legitimate origin initiates request, mutated by scripts](#legitimate-origin-initiates-request-mutated-by-scripts)
    - [Hijacked mediator](#hijacked-mediator-1)
    - [User interaction required to open authorization portal](#user-interaction-required-to-open-authorization-portal)
    - [Mediator privacy](#mediator-privacy)
    - [Why is identity simpler here?](#why-is-identity-simpler-here)
  - [Mediator notes](#mediator-notes)
    - [Mediator verification of origin](#mediator-verification-of-origin)
  - [Mediator](#mediator)
    - [Alternatives](#alternatives)
- [Authorizing payments](#authorizing-payments)
  - [Motivation](#motivation-1)
  - [Improving recipient identification](#improving-recipient-identification)
    - [Prevent accidental repeat payments](#prevent-accidental-repeat-payments)
    - [Repeat recipients](#repeat-recipients)
    - [Trusted recipient providers](#trusted-recipient-providers)
    - [Intra-provider](#intra-provider)
    - [Extension: Twitter](#extension-twitter)
      - [Twitter Extension Fields](#twitter-extension-fields)
    - [Extension: GitHub](#extension-github)
- [Payment outcome](#payment-outcome)
- [Misc. drafts](#misc-drafts)

# Overview

For one party to pay another on Interledger, they must exchange this information. Interledger payments use [STREAM connections](https://interledger.org/rfcs/0029-stream/#4-life-of-a-connection) to aggregate many packets into a single payment to the recipient's account. For the payer to send these Interledger packets, they typically resolve the recipient's account details via an HTTP endpoint determined from the recipient's [payment pointer](http://paymentpointers.org).

But, the recipient still needs a mechanism to transmit these payment parameters, such as a payment pointer or amount, to the payer. For instance, if the recipient visually displayed them to the payer, the payer would have to manually enter the parameters into their software, burdening the user experience.

An improved solution would be for the recipient's initiation software to automatically transmit the details to the payer's trusted wallet software, or authorization portal. The authorization portal would render the parameters of the proposed payment without the payer manually entering them and prompt the payer to approve or decline the payment.

The payer may hold an account with an Interledger wallet or provider, which sends payments on their behalf, and hosts the authorization portal they use to approve payments. The recipient doesn't know in advance the provider of the payer, and may not have any relationship with that provider.

Motivated by these constraints, this document specifies software-based solutions to initiate and request authorization for Interledger payments, including:

1. Common mechanism(s) for the recipient's initiation software to discover the payer's authorization portal;
2. Common, well-defined APIs to transmit payment parameters among the systems, and how they affect ILP payment execution;
3. Policies to prevent users from authorizing unintended payments.

## Glossary

**Receiving side**

1. _recipient_ — person, party, or merchant who requests payment and whose account the funds are credited to.
2. _initiating context_ — generic term for the context by which the recipient and prospective payer connect. For example: the recipient's website, their mobile application, or a payment terminal at their physical storefront.
3. _initiator site_ — website or page, administered by the recipient, which requests payment from the prospective payer visiting it.
4. _initiator client_ — client-side scripts on a webpage, administered by the recipient, which initiate and orchestrate the payment flow.
5. _reception software_ — trusted software or back-end, administered by the recipient, to setup the payment and/or verify payment completion. ~~For example, a server-side backend to check if funds are received.~~ In most cases, this is distinct from Interledger infrastructure, since the recipient doesn't need to operate that themselves.

   TODO — maybe have a more generic word for backend? Payment _host_ backend? How to explain the allowlist

6. _recipient's provider_ — Interledger provider which services and credits funds to the account of the recipient.

**Sending side**

1. _user_, _payer_ — user who authorizes the payment and whose account the funds are drawn from.
2. _wallet_, _payment app_, _authorization portal_ — trusted software interface enabling the payer to authorize and perform payments. Depending on the context, this may refer to only web-based applications, or also include native applications. Typically, this is software hosted by the user's Interledger provider. However, a distinct term is used to also encompass third party wallet software and differentiate this component from ILP infrastructure executing the payment.
3. _user's provider_, _payer's provider_ — Interledger provider which services and debits funds from the account of the payer. Often, but not necessarily, the payer's provider hosts a wallet and authorization portal.
4. _sending agent_ — system which sends and executes the ILP payment using STREAM, SPSP, and/or Open Payments. This system does not necessarily transmit money, if no liability is accrued between it and the next ILP hop.

## Flow

TODO — insert diagram here showing each party and how it's involved

# Interledger payment request

TODO: intro

## Motivation

Maybe, move the "Motivation" somewhere else? That's as much about discovery as it is about transmitting the payment parameters between the systems —

The recipient may discover and interface with the payer's authorization portal differently depending upon the context in which the parties connected with one another. For example:

- **Website.** The user is visiting the recipient's website, and the page requests a payment. The recipient needs to discover the authorization portal within the context of that web browser and open the web-based authorization portal with the payment information.
- **Native application.** The user is interacting with the recipient's native application, which requests payment. Using deep linking and custom URI schemes, the recipient navigates the payer's authorization portal, another installed application, to kick off the payment flow.
- **Link sharing.** The recipient uses a third party service, such as a messaging or social platform, to share a link with the prospective payer. Opening the link in a browser initiates a web or native app -based payment flow.
- **Physical proximity.** The user is physically at the recipient's place of business, and the recipient needs to transmit details from a payment terminal to the authorization portal, which is a mobile application on the user's device. This is out of scope of this specification.

In each context, a well-defined format is required to transmit payment details from the recipient's software to the sender's software. This proposes a URI encoding format for these parameters applicable to web-initiated payments, and later, extended to native app deep linking.

## Encodings

TODO explain query string vs JavaScript object encoding — used in different contexts

## Query string encoding

To create a payment request, encode and concatenate each field as a component in a query string, for use in a URI. Follow this algorithm to build the query string:

Begin with an empty string. Then, for each field, in any order:

1. If string is empty, append `?`. Otherwise, append `&`.
2. Append the name of the field (for example, `**invoiceUrl**`).
3. Append `=`.
4. Serialize the value of the field using its own encoding rules, then [percent-encode](https://en.wikipedia.org/wiki/Percent-encoding) it so all characters are URL-safe. Append the value of the field.
5. Repeat again for each remaining field.

Similarly, software decoding the payment request reverses the algorithm to decode the query string into its composite fields.

## Payment parameters

TODO: Should this include a callback URL for the outcome?

#### Fields

| ﻿Name                     | Description                                                                                                                     | Query string encoding | JavaScript object encoding |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------ | :-------------------- | :------------------------- |
| interledgerPaymentRequest | Required. Always "true". REMOVE?                                                                                                |                       |                            |
| version                   | Required. Version of the IPR spec, which is "3". REMOVE?                                                                        |                       |                            |
| paymentPointer            | Payment pointer resolving to a URL for an SPSP endpoint or Open Payments account endpoint.                                      |                       | string                     |
| invoiceUrl                | URL of an Open Payments invoice, representing an amount payable to the recipient in their destination units. HTTPS is required. |                       | string                     |

### JavaScript object serialization

TODO — should this be what's used within `PaymentRequest` if we support that?

Interesting idea with `PaymentRequest` is if we _know_ the browser supports payment instrument registration, then no registration with the mediator is required !

Rename this to `PaymentRequestData` so it applies to PaymentRequest API and the mediated flow?

```tsx
interface PaymentRequestMessage {
  type: 'PaymentRequestMessage' /* TODO will this conflict with the payment type if it's used later? */
  // TODO Change to `messageType`?

  /** TODO explain */
  paymentPointer?: string

  /** TODO explain */
  invoiceUrl?: string
}
```

## Executing payments

TODO: explain that some providers may only support some subset of this

To send a payment using STREAM, the sender software must know the **destination address**, or ILP address of the recipient's account, and know the **shared secret**, used to derive encryption keys so the recipient can securely fulfill incoming packets.

The sender software resolves this information from an HTTP endpoint, using SPSP or Open Payments. The provided fields determine how to resolve these details:

### Open Payments invoice

[Open Payments invoices](https://docs.openpayments.dev/invoices) are stateful resources represent an amount payable to the recipient. If `**invoiceUrl**` was provided, the sender should [resolve the payment details](https://docs.openpayments.dev/payments) [from the invoice resource](https://docs.openpayments.dev/invoices) using that URL.

The sender software should determine the ascertain the minimum delivery amount, in destination units, from the invoice. If authorized, the sender software should prepare to execute a [fixed-delivery payment]().

- Explain why no direct destination amount — for security/tampering. Implementing an OP invoice server is reasonable and not too complicated for those use cases

### Payment pointer

If `**paymentPointer**` was provided instead, the sender should [parse it to the corresponding account URL](https://paymentpointers.org/syntax-resolution/).

The sender should query the Open Payments and/or SPSP account endpoints (both may be performed in a single request which accepts both MIME types).

Then, it should parse the response as an [SPSP response](https://interledger.org/rfcs/0009-simple-payment-setup-protocol/#query-get-spsp-endpoint) or [Open Payments account](https://docs.openpayments.dev/accounts#get) and [payment details](https://docs.openpayments.dev/payments) response. In either case, the sender extracts the destination address and shared secret so it may establish a STREAM connection. If the response represents an Open Payments account, it should also extract the destination asset and denomination to enforce exchange rates. (Otherwise, the destination asset needs to be resolved using STREAM via the `ConnectionAssetDetails` frame after the connection is established).

The sending software should prepare to execute a [discretionary payment]().

### Fixed-delivery payments

~~Open Payments invoices are recommended for fixed-delivery payments. TODO~~

Explain quoting, maximum source amount, etc.

<Explain why no backwards compatible fixed delivery is supported&gt;

### Discretionary payments

In the absence of minimum delivery amount, the sender software may choose any amount to send in their source asset (also called a fixed-source amount payment). Often, this class of payment is used for tips, donations, or Web Monetization micropayments with no quid-pro-quo.

The recipient or its reception software SHOULD NOT expect or verify that any specific amount was delivered, but MAY compare the delivered amounts between multiple payments to the same destination account.

### Recurring, discretionary payments

For future extension.

### Recurring, fixed-delivery payments

For future extension.

# Interledger payment outcome

Should this be called something else? Do the query parameters need to be versioned, or are they implicit?

Does this need type and version information!? Or not? → OAuth probably does, right?

TODO — how should this be differentiated with the payment request URI? Does it need to be, or can it be inferred from the _context_?

TODO: Update these fields

#### Fields

| ﻿Name         | Description                                               | Query string encoding                 | JavaScript object encoding |
| :------------ | :-------------------------------------------------------- | :------------------------------------ | :------------------------- |
| streamReceipt | STREAM receipt attesting to the greatest delivered amount | Base64 encoded with URL-safe alphabet | UInt8Array                 |
| status        | Complete — Payment successfully completed                 |

WalletAbort — Wallet cancelled the payment
UserAbort — User cancelled the payment
ExecutionFailure — Interledger payment failed to fully complete
NotSupported — Provider does not support type of payment or its parameters||string|

## JavaScript object serialization

For use via `[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)` or the [PaymentRequest API](https://developer.mozilla.org/en-US/docs/Web/API/PaymentRequest), this is the schema for a JavaScript object that supports [structured clones](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm):

```tsx
interface PaymentOutcomeMessage {
  /** Uniquely identities this message from other types of messages sent from the same window */
  type: 'PaymentOutcome'

  /** TODO */
  streamReceipt: UInt8Array

  // Should this info be trusted or not? It _is_ important to interpretation of STREAM receipts
  // TODO Destination asset details?
  // TODO Delivered amount?

  status:
    | 'Complete'
    | 'WalletAbort'
    | 'UserAbort'
    | 'ExecutionFailure'
    | 'NotSupported'
}
```

# Web-based discovery

In order to securely authorize payments, the payer's provider must authentically communicate the parameters of the payment, such as recipient and amount, to the payer with trusted, first-party UI. If the payer didn't verify this information before the payment is executed, or it could be spoofed, third parties might be able to spend from that user's account without their consent.

But, since payments are initiated from the recipient's site, the user needs a method to navigate from the page initiating the payment to the authorization page of their provider and transmit these payment parameters.

Necessitating users manually navigate to their provider compromises their experience. However, hardcoding a set of providers in the recipient's website compromises open interoperability; that is, new providers should automatically interoperate with any existing sites that have deployed this flow. And while some browsers support modern payment APIs to match a user's payment providers with the merchant's, this is not universal (as of February 2021, Safari and Firefox have not implemented the [Payment Handler API](https://www.w3.org/TR/payment-handler/)).

Therefore, the recipient needs a neutral, low friction, cross-browser compatible mechanism to discover the user's Interledger providers. To solve this, this flow leverages a common mediator website, intended to be operated by a neutral party, to locally cache which payment providers the user of that browsing context registers.

This flow is designed within constraints of tracking protections such as limited or blocked third-party cookies, which [most](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) [major](https://docs.microsoft.com/en-us/microsoft-edge/web-platform/tracking-prevention) [browser](https://blog.mozilla.org/blog/2019/09/03/todays-firefox-blocks-third-party-tracking-cookies-and-cryptomining-by-default/) vendors have rolled out, or [plan to](https://blog.chromium.org/2020/01/building-more-private-web-path-towards.html), as of February 2021. Similarly, privacy is a key consideration in this flow. The scheme is designed so the mediator does not know payment details such as the recipient nor amount. [Link to privacy model section]

### Mediator overview

The mediator is a web service hosted and operated by the Interledger Foundation [TODO: link].

[Explain how the mediator works]

The mediator implements two user flows:

1. **Wallet registration.** TODO
2. **TODO.** TODO

[Update this flow diagram]

[https://whimsical.com/interledger-web-Br3k5kWKUTJFe264v9ELUV](https://whimsical.com/interledger-web-Br3k5kWKUTJFe264v9ELUV)

# Initiator client spec

The recipient embeds an **initiator client** into their webpages, which is client-side JavaScript that initiates and orchestrates the payment flow. For interoperability among different providers and recipients initiating the payment, the initiator client MUST implement this specification.

## Choosing the flow

Two flows are supported to discover the payer's wallet and connect it with this client:

1. **Mediated flow.** TODO using a neutral mediator website to cache a user's registered providers. This approach has broad compatibility among modern browsers, but has more friction in onboarding.
2. `**PaymentRequest` flow.\*\* TODO using the browser to mediate and discover common providers. This approach offers a superior user experience in supported browsers, with an in-context payment app window, and automatic registration of the payment app. But, it's only supported by some Chromium variants, including Google Chrome, Microsoft Edge, and Brave Browser.

Since the mediated flow is in part modeled after payment handlers, sometimes the two share similar terminology, but contextually refer to different concepts.

Initiator client code may choose to support one or both flows. If the initiator code supports the `PaymentRequest` flow, it SHOULD prefer that flow, if the browser supports it, before reverting to the mediated flow.

In the future, detection for additional flows may be added, such as a protocol handler to open a native application.

TODO — move this somewhere else? To check if third-party payment handlers are supported in the browser, use these conditions:

```jsx
if (!('PaymentRequest' in window)) {
  return
}

const request = new PaymentRequest({
  // TODO add the params here
})

if (request.hasEnrolledInstrument) {
  // TODO handle return value true/false
  await request.canMakePayment()
} else {
  // No custom payment instruments are available ?
  return
}
```

## Hosting a payment app

TODO — add note about manifest, or should that be referenced below?

## Mediated flow

### Mediator explanation

TODO

### Guide

1. **Open mediator window**

   The initiator client may initiate the payment flow following a user interaction such as a click or tap. (Browser pop-up blockers may also enforce so the pop-up window is not opened arbitrarily).

   First, the initiation scripts must discover the user's preferred wallet from the mediator's selection page. The user may select among multiple registered wallets, or their only registered wallet will automatically be chosen. In case no wallets are registered, the initiation scripts MUST provide default, recommended wallet(s) to the mediator.

   To create the URL of the mediator selection page:

   1. Begin with `MEDIATOR_SELECTION_URL` as the base URL with hostname and path components.
   2. Append first part of query string, `?recommendedWallets=`, to the URL.
   3. Create comma-separated string of the origins of each recommended wallet.
   4. Safely encode the URI component, then append it to the URL to complete the query string.

   For example: `[https://interledger.org/mediator/select?recommendedWallets=wallet1.example%2Cwallet2.example](https://interledger.org/mediator/select?recommendedWallets=wallet1.example%2Cwallet2.example)`, given a `MEDIATOR_SELECTION_URL` of `https://interledger.org/mediator/select` and two recommended wallets hosted on `wallet1.example` and `wallet2.example`.

   Add note about displaying other UI while payment is in progress? Check `window.closed` at interval?

   Link to window.open API on MDN

   ```tsx
   window.open(mediatorSelectionUrl, windowName, windowFeatures)
   ```

   - **Why `window.open` instead of redirect to mediator?**

     TODO — copy from section way below

   Explain why window.open vs redirect

   ```jsx
   const win = window.open() // Window has null origin
   win.opener = null // Overwrite reference to prevent mediator maliciously redirecting opener page
   win.location.replace(MEDIATOR_SELECTION_URL) // Navigate pop-up window to mediator
   ```

   Link to window.opener page discussing security issues

   Explain what happens in the interim? User selects their wallet?

2. **Listen for selection message**

   Listen for `message` events on the opened window. Identify the wallet the user selected by listening for an event with a `[data` payload](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#the_dispatched_event):

   ```tsx
   interface WalletSelectionMessage {
     type: 'WalletSelection'
     authorizationUrl: string
   }
   ```

   `authorizationUrl` is the HTTPS base URL of the authorization portal of the selected wallet, with protocol, hostname, and path components, but no query parameters or fragment.

   If no wallets were registered, the `authorizationUrl` will correspond to one of the wallets recommended by initiation scripts.

   If the given hostnames had no payment app manifest → no selection message, abort instead?

   ```tsx
   interface SessionAbortMessage {
     type: 'SessionAbort'
   }
   ```

3. **Construct payment request URI**

   The client should build its own payment request query string based on the desired parameters of the payment.

   Then, it should append the query string to the HTTPS authorization URL.

   Alternatively, should these be sent via postMessage to the window? e.g., what if interaction is needed for nonce protection etc.?

4. **Redirect payment session to selected authorization portal**

   Redirect the window to the authorization portal by setting `window.location` to the constructed authorization URL.

   TODO

5. **Listen for payment outcome**

   TODO — or should it be redirected automatically to some page based on the referrer...? Should it use `postMessage` API instead?

   TODO — client scripts may implement their own custom post-payment behavior

   Then, the authorization portal should close itself, transitioning the user back to the original window. (This enables the provider to implement additional functionality after the payment is complete, rather than the initiating window automatically closing the authorization portal).

## `PaymentRequest` flow

The [Payment Request API](https://developer.mozilla.org/en-US/docs/Web/API/Payment_Request_API) is a web standard, implemented by browsers, to manage user payment methods, display payment information within trusted UI, and reduce payment friction through a consistent experience across merchants.

Insert video?

The [Payment Handler API](https://w3c.github.io/payment-handler/), as a proposed extension to Payment Request, enables third parties to register their own custom "handlers," or payment instruments, TODO

Payment handlers — explain — instruments

Functionally similar to mediator — mediated flow is modeled on and replicates some of this functionality —

Some browsers support `PaymentRequest`, but not third-party payment apps, such as Firefox, which only supports cards, or Safari, which only supports Apple Pay.

### Payment handler overview

**Payment handler registration**

TODO

**Payment handler data flow**

[https://whimsical.com/payment-handler-overview-6XvMqwFqbGo7ei8PpdWVym](https://whimsical.com/payment-handler-overview-6XvMqwFqbGo7ei8PpdWVym)

TODO — many browsers support payment request with cards, ApplePay, etc., but also extensible to custom payment methods

**Payment handler UX**

TODO — create Whimsical wireframe?

**Payment handler payment methods**

TODO

### Payment app aggregators

TODO — different payment methods can include multiple hostnames

### Payment method manifest

Payment initiators specify one or multiple supported methods when creating a request. "Payment methods" TODO

Any origin may host their own payment method by hosting a payment method manifest.

The Payment Handler API is designed so the party responsible for a payment method, corresponding to the URL of that payment method...

TODO — hosted by [interledger.org](http://interledger.org) — but other neutral third party aggregators can host this as well

# Authorization portal spec

Authorization portals host a public endpoint that ... ...

TODO: Add note about payment app manifest — so mediator can reference it for the selection sheet —

Change this to heading 1 and "Web-based authorization"?

Authorization portals host a public-facing page to process incoming payment requests and render UI to authenticate their user and seek authorization for the payment: an **authorization page**.

Since the initiating site and the payer do not have a preexisting relationship, the authorization page MUST ...

## Payment instrument service worker

I should explain here how all the pieces fit together...

Mediated flow uses postMessages → so very simple for service worker to forward PR events as postmessages to the user-facing UI

## Payment app manifest

Wallets must host a [web app manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest) to supply metadata such as the name, short description, and icon rendered within the mediator. But, wallets MUST also include these additional parameters for use by the mediator and initiator client:

#### Custom Fields

| ﻿Member           | Type       | Description                                                                                                                    | Parent                                                                                               | Children                                                                                                   |
| :---------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| interledger       | Dictionary |                                                                                                                                |                                                                                                      | Custom%20Fields%203c241d488e234d31bf6dae7ff073ecd5/authorization_url%20267490e996be4c9fb4b0396c792955eb.md |
| authorization_url | String     | HTTPS URL with host and path components corresponding to the wallet's authorization page, but no fragment or query components. | Custom%20Fields%203c241d488e234d31bf6dae7ff073ecd5/interledger%200b495a8ba99b4242a63e2133e2bd5f8c.md |                                                                                                            |

Here's a non-normative example:

```json
{
  // Standard Web app manifest metadata
  "name": "BobPay",
  "description": "Send micropayments with Interledger",
  "icons": [
    {
      // ...
    }
  ],

  // Interledger metadata
  "interledger": {
    "authorization_url": "https://bobpay.example/pay/authorize"
  }
}
```

In the future, more manifest keys may be added, for instance, to specify which features a payment app supports.

## Authorization portal

TODO — accepts incoming messages? Or reads query parameter?

Explain what the authorization portal _does —_

1. Authenticate user
2. Query and determine parameters of payment
   - Quote or amount
   - TODO
3. TODO

### Authentication

How authorization portals or providers should authenticate the payer is left out-of-scope, but TODO

### Registration with mediator

TODO — how can the UX of this not suck? And how could it work automatically for Coil?

If Coil can register via automatic redirect with no user interaction → requires privileged list of providers, potentially flags Coil as a tracking domain in Safari

## Security model

Vectors such as phishing, cross-site scripting (XSS), or man-in-the-middle (MiTM) attacks could change, masquerade, or inauthentically represent the true identity of the recipient so that users mistakenly approve unintended payments and lose funds.

Security policies implemented by authorization portals are uniquely important for Interledger payments:

1. Interledger provides no native payment reversal or dispute process, and it may not be possible to retroactively seize funds from the recipient.
2. The payer's provider does not know the recipient or service them.
3. Design decisions to minimize micropayment friction may also increase the effectiveness of phishing and other attacks.

Providers, services, or software enabling users to authorize and send payments ~~("authorization portals")~~ must ensure users sufficiently understand the outcome of the payment: for example, the amount their account will be debited, and who the recipient of the payment is. Authorization portals should block or warn against payments that they surmise are not the intended, authentic recipient ...

Transition to other attack vectors / other parts of the model —

~~Therefore, for _any_ payment presented to the user for authorization, authorization portals must present sufficient identity information to a user so that they can reasonably distinguish an intended payment recipient from a fraudulent payment recipient.~~ (this is good, but move somewhere else)

### Payment pointers and accounts

Move this section later?

Payment pointers, and their corresponding [account endpoint URL](https://paymentpointers.org/syntax-resolution/), identify unique accounts payable with Interledger.

DNS ensures global uniqueness of these account URLs, so anyone may declare an account they may be paid at without a risk of colliding with others. Proprietors of other contexts, such as the owner of a public social profile, may reference their payment pointer as a way of designating how to pay that proprietor. Since payment pointers are short in length, partially human-readable, and generally don't reveal private information, they work well for such attestations by third parties.

Sub-resources of an account, such as [Open Payments invoices](https://docs.openpayments.dev/invoices#apis), ensure that only the account owner can set requested payment parameters such as the delivery amount and expiration time.

Together, attestations and account sub-resources, leveraging this chain of ownership, enable an authorization portal to validate payment information as authentic to the recipient before presenting it to the payer.

### Client-side vulnerabilities

Any website requesting payment should implement their own measures to prevent client-side vulnerabilities such as cross-site scripting (XSS) or compromised third-party scripts. However, payment processors must assume some undiscovered vulnerabilities exist and design systems with [defense in depth](https://www.cisecurity.org/spotlight/cybersecurity-spotlight-defense-in-depth-did/) to secure against them.

TODO — enforce and limiting recipients who can be paid, vs enforcing invariants about the parameters for that _payment session —_ type of payment, amount, etc. Different challenges...

Different scenarios warrant different mitigation measures:

1. Website with a trusted, static set of recipients (e.g. single publisher hosting a blog, merchant operating an ecommerce site)
2. Website with an untrusted, dynamic set of recipients (e.g. blogging platform with open registration, ecommerce platform with many merchants)

[To prevent these vulnerabilities, the ... unaffected by client-side code. Former, site-wide policy; the latter, page-by-page policy]

**Mitigations for trust, static recipients**

To mitigate client-side vulnerabilities, two mechanisms are used:

1. Site statically hosts a list of allowed payment pointers for any payment initiated by that domain; and
2. Authorization portal ascertains domain that initiated the payment request.

TODO — explain this

**Mitigations for untrusted, dynamic recipients**

Platforms are already highly motivated to prevent cross-site scripting vulnerabilities, since they may enable the mass (?) exfiltration of user access tokens or performing arbitrary account activity. For this reason, many platforms may already lock down their third party scripts and frames using a Content Security Policy, and rigorously sanitize all user-generated content.

Adding functionality for users to initiate payments only heightens this existing risk. For platforms, enforcing that the correct recipient is paid is more challenging, _since the attacker can simply register as another recipient on the platform_.

Therefore, platforms need an additional server-side component to match payment requests for a given page to the correct recipient for that page. (Note that platforms _already_ must implement their own server-side functionality to render the correct payment recipient in the correct page).

If platforms want to minimize the risk of a cross-site scripting attack mutating a payment recipient or user-generated content inserting arbitrary payment buttons, they can isolate their payment initiation code within an `<iframe>` on a subdomain. As a future extension, a challenge-response or Diffie-Hellman key exchange between the recipient's backend and the authorization portal could also prevent this attack vector.

TODO — link to separate section with these mitigations

**Non-mitigations**

Measures which rely on the _user_ to cancel the payment based on other identifying information, such as the initiating domain, payment pointer, or social identity, generally will not mitigate XSS vulnerabilities:

1. **Payer doesn't know identity of the recipient.** If transacting on a platform, a user may pay for a digital good or donate for content without knowing the name or identity of the recipient, but merely tacitly understanding who the recipient is. For example, users should not be expected to match the author of a blog post to the username of a payment pointer within their authorization portal.
2. **Attackers can change the rendered recipient.** Since this XSS vulnerability assumes complete control of the client, the attacker can simply change the rendered recipient to another registered identity they control. For example, if the user is reading a blog post on a platform but is not familiar with the publication, they should not be expected to identify an incorrect author.
3. **Phishing payment pointers.** Attackers can register a username at the recipient wallet similar to a targeted recipient, which the user would not be able to differentiate or recognize. Note, however, that this requires attackers to target individual recipients on a platform, instead of any recipient.
4. Not all PPs will be vanity PPs?

Instead, XSS must be prevented through trusted, server-side code or data that cannot be tampered with by client-side scripts.

To simplify the deployment of this payment initiation flow for recipient websites, this scheme does not require them to deploy server-side code or manage cryptographic keys.

These mechanisms secure against this class of vulnerability:

1. **Allowed recipient list**

   Recipient sites MUST statically host a list of allowed recipients, or payment pointers allowed to be paid, for any payments initiated by that domain.

   TODO: Add note that some sites may allow many allowed payment pointers?

   Recipient sites can specify these payable accounts using any of the following methods:

   1. Include a static [monetization `<meta>` tag](https://webmonetization.org/docs/getting-started) in the root `index.html` file (not dynamically inserted by scripts)

      Recommend for simple, existing web monetized sites.

   2. Add a key to their [web app manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest) with allowed payment pointers (TODO: spec)

      Recommend for sites with multiple or a dynamic set of recipients.

   3. Host the site from the same domain as the payment pointer (e.g. vanity payment pointers) — doesn't prevent XSS directly, however ...

      Doesn't require a list of allowed PPs for large platforms, so much simpler — \*\*but doesn't solve the case where the attacker has a PP on the platform itself

      Is this any better than just saying "allow all" and "deny all" with the subdomain?

      If no subdomain iframe, has the _slight_ benefit that it gates recipient PPs to registered users instead of any PP, but if any user can still register, it's still not great

      → Just simpler since you don't need a massive publicly hosted list!

   To enforce this, the authorization portal MUST:

   1. Determine the origin that initiated the payment using the `Referer` header. The authorization portal MUST block requests with no referrer.
   2. Determine allowed payable accounts for that origin using all methods outlined above.
   3. Proceed only if the recipient account meets any of the allowed payable accounts, or else MUST block the payment.

   TODO: explain how this prevents changing amounts of invoices, etc. too for fixed-delivery payments

   TODO: move this elsewhere
   The initiating page always opens a new window to the mediator. After the wallet is selected, the initiating page redirects the child window to that domain via setting `window.location`, so the referrer of the request to the authorization portal is the domain of the top-level page or `<iframe>` that initiated the payment.

   - A flow with top-level redirects (without opening a new window) is not supported. For the authorization portal to identify the correct origin that kicked off the flow, the mediator would first need to redirect back to the initiating site, which would then redirect to the authorization portal, requiring server-side code. Also, for privacy, payment details should not be passed through the mediator.

   Add note — does not solve XSS if the attacker also has an allowed payment pointer for that domain (consider a platform with many users). In this case, some server-side code is required per subsequent protection mechanisms

2. **Initiate payment from isolated <iframe&gt;**

   For additional security, the recipient site can optionally host the payment initiation UI within an `<iframe>` on a subdomain. Since the `<iframe>` would be protected by same-origin policy, top-level scripts would not be able to mutate payment parameters in scripts loaded into the `<iframe>`.

   For example, suppose a content platform allows any creator to register with their payment pointer. If that platform wanted a server-side component to secure against XSS in which Alice's content is mutated to pay Bob, they might implement this approach. On load of the `<iframe>`, the server can check the referrer to determine the correct recipient for that top-level page. Even through most browsers ([including Chrome](https://developers.google.com/web/updates/2020/07/referrer-policy-new-chrome-default)) strip the path from cross-origin referrers, the request to load the `<iframe>` document should have access to the full referrer since they share the same eTLD+1.

   <Add note about payment providers, with high focus on security, implementing this approach → but they won't have access to the full referrer for privacy ? &gt;

   To access full referrer... alternatively, site could host a redirect that includes full referrer and passes it on as query param (request could be passed on to the payment provider?)? But that might be even _more_ complicated for them to integrate with!

3. **Phishing via XSS**

   If an XSS attack inserted an `<iframe>` with UI initiating the payment flow from an attacker-controlled origin (which would allow paying itself), this effectively becomes a phishing attack, with additional protections discussed later.

   Sites should also consider deploying a strict [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-src) to limit the allowed origins of embedded `<iframe>`s.

### Hijacked mediator

The mediator, enabling the initiating site to discover that user's authorization portal, [bad things can happen]

1. Mediator op-sec is very important → don't get comp-ed
2. ~~⭐ Interesting idea... host window could say, "you have to send me a `postMessage` back—attesting to your domain, essentially—every 500ms or else I will close you" → prevents mediator redirecting its page ... but does it prevent mediator from opening a new window...? ... \*Wallet should prevent embedded iframes~~

   - ~~Mediator won't have ability to embed iframe of wallet — wallet disallows that~~
   - ~~Mediator _could_ render a phishing wallet in an iframe → relies on user to identify~~
   - ~~Mediator can't redirect _its_ window without the host closing it within 500ms/interval (?)~~
   - ~~Mediator can't redirect or close the host window since we overwrite `window.opener`~~
   - ~~Mediator needs user interaction to open a new window (which wouldn't be known to original window) (?)~~
   - ~~Consider other vectors here ... (?)~~
   - ~~→ Are there UX risks with this, e.g., if the user exist the browser and it's in a power-saving mode?~~

3. **Compromised mediator can man-in-the-middle all payments (security)**
   - Higher minimum identity attestation requirements address might deter/reduce effectiveness
   - Displaying initiating domain via referrer might deter/reduce effectiveness
   - In lieu of mediator, use `PaymentRequest` where available, or native app with custom URI scheme → obviates need for mediator
     - Would a compromised mediator be able to cause mayhem with the payment request, e.g., changing default payment application with just-in-time installation, etc.?
   - Note: possibly worse than single wallet compromised (compromises all wallets), possibly harder to detect, possibly easier to perform (swap out payment pointer)
4. **Compromised mediator can log all payment details (privacy)**
   - If the site is already attesting to their payment pointer publicly (website, Twitter profile), can this be solved?
     - e.g., mediator may know because a particular site initiated the request, more publicly available information about the user is available (unless they specifically use `noreferrer`? But that implies `noopener`, which would prevent any cross-frame messaging)
     - Should other payment details (invoice, amount, other metadata) be subject to additional protections?
     - Is it important that the mediator displays the domain that initiated the payment request?
   - Hosted list of allowed authorization portals, each authorization portal hosts a public key. Initiation software encrypts the payment details using one of those public keys (when? how? is this necessary?)
     - It'd probably be much simpler to only perform the redirect if the selected portal is in a cached version of the list, and then redirect with the raw payment details, since it's going directly to the intended wallet anyways (?)
     - 🚨 But... this requires a more complex server-side component — need a simpler/easier to integrate approach
     - How does the sending wallet ascertain the domain that initiated the payment request to display to the user? Referrer requires redirect, kinda complicated...separate window idea might be simpler since it can be programmatically called
     - Would this work with static sites?
     - Does the `postMessage` approach potentially preserve privacy? e.g., instead of redirect, initiation software (client side scripts) check that the selected wallet is within the list
     - ~~Then, `postMessage` can be used to ascertain the origin of the initiating frame (?)~~
       - ~~Would this be problematic if~~
     - In my tests, when the original page redirects a window it opened, the correct referrer _is_ available in that request
       - Verify this in Safari
     - Simpler, since it's all part of the URI instead of requiring a `postMessage`-based API, potentially
       - Should the mediator also take a callback URL?
       - Even in Safari, this seems to work
     - Ah: there's another "hack." Client page can open window, then set `window.opener` to `null`, then set `window.location`. I think we're getting there...
       - Chrome, Safari, Firefox all treat the origin of the window as `null` which seems to put some good cross-origin protections
       - Good since this secures against the mediator redirecting the origin page 👍
       - Then, the window object is also available so it may listen to redirects versus `noopener` (!?)
         - Is checking `window.location` for cross-origin allowed... would that require polling, etc.
         - Could `postMessage` be remapped on that window instance?
         - What if the origin site sends a `postMessage` to the new window? Will it be received? And _then_ will it get access to the origin window? Or is it not possible for it to receive a `postMessage` at all?
       - Could the `window` object be further restricted so child windows can't be opened from the mediator window?
         - However, I'm not sure this is the best route to go — give up on this mechanism (?)
5. **Phishing page requests payment (security)**
   - Sending wallet can block requests from known phishing pages
   - Prominently displays initiating domain to user... (brilliant) ...to deter/reduce effectiveness of phishing
   - Higher minimum identity attestation requirements, using public-facing identities, to deter/reduce effectiveness of phishing
6. **Require user-interaction**
   - Is it problematic that any page can open the payment authorization page with no interstitial page or user interaction required? (For instance, opening a new window and using `postMessage` might necessarily require that user interaction with another web page kicks off the payment flow before the wallet is opened)
     - Alternatively, is it problematic if user interaction is _required_?
     - So, this requires (2) steps to do the payment: once in a recipient-trusted web context, and once in a payer-trusted web context
7. **Privacy** — add note that any registered wallet domain(s) are essentially publicly available (?), e.g., if automatic registration
   - And as with WM, the payment pointer of a domain is probably publicly-accessible information

### Replay attacks

TODO — explain attack vector, preventions

Problematic since initiation software is not necessarily trusted by the recipient within the XSS model

## Privacy model

TODO

### Linking recipients to public identities

TODO — website, social profiles → PP

Resolving PP, may know website or social profile of recipient

### Hiding payment details from mediator

1. Mediator is stateless, but requires cookies sent as subresource since HTTP cookies are protected in Webkit → no logging, etc.
2. ...

### Wallet privacy

TODO

## Threat model

### Legitimate origin initiates request, mutated by scripts

Solution 3 — "content security policy" for payment pointers — whitelisted payment pointers hosted by origin AND sending wallet ascertains origin (\*but doesn't solve for mutation of amount or other parameters, if that's important — but maybe it isn't?)

Basically, a trusted server-side component (which _cannot be compromised by XSS_) transmits the payment parameters to the sending wallet, or proves they initiated a request with those parameters — so static hosted file or HTTP header

"Replaying" payments are also problematic here, e.g., if the site changed accounts or something

### Hijacked mediator

Example: attacker compromises employee with access to mediator infrastructure and deploys compromised version, which changes the destination of some or all payments.

**Why open a new window and use `postMessage`?**

1. Opening a new window necessitates user interaction, otherwise the browser will block the call. This prevents users from following a link (via email, messaging, or native app) and their web-based wallet automatically opening without seeing the page initiating the payment or any explanation for why the payment is requested.
2. The authorization portal MUST enforce that payment details were only transmitted to it by (a) the original window that opened it, and (b) the window that opened it is a top-level context.
   - Since the mediator is opened as a child window, it necessarily cannot send this message to the authorization portal, since it is not a top-level context.
   - The mediator could try to open a new top-level window using `noopener`. However, opening the authorization portal as a child window would require another user interaction. TODO (?)
   - If the mediator redirected the opener page, the user might notice, and would it lose access to that window handle? No...the pop-up still has access, so it could postMessage, then parent would have event.source or whatever —
   - Mediator CAN still redirect to a phishing page for the wallet → seems...non-ideal
   - If the mediator pop-up were to maliciously redirect the opener page, hopefully the user would notice.
   - If a window is opened with `noopener`, it effectively becomes a new top-level context. However, this also means the original window loses access to that window context, and therefore no payment details are sent ...
3. Privacy of payment request from mediator — if they intercept, payment fails

\*\*\* `window.opener.opener` → not opened by a top-level window? Interestingly, this seems to persist even across script-initiated redirects? Test more thoroughly

But, mediator could call `window.opener.close()`, then it's `window.opener` becomes `null`, so if it opens a new window, that `window.opener.opener` would appears `null`

\*\*\* Should wallets require a `Referrer` from mediator with a secret key included in the cookie? What would that protect against, in terms of, another site opening that wallet directly without sending the user to the mediator?

→ what if that secret key was sent back to the merchant first? Or, MAC(encryptedPaymentDetails, secretWalletKey)

\*\*\* When would the payment details get encrypted? e.g., mediator redirects back to merchant with selected wallet, merchant encrypts payment details (it'd identify which payment maybe via some token passed through), then redirects with encrypted payment details

**Why no redirect-based flow?**

TODO — payment details must be sent through mediator — hurts privacy, plus man-in-the-middle attack — and authorization portal must trust mediator to tell it the origin domain via query params

If instead a top-level navigation were used from the initiating website to the mediator, the question becomes, how are payment details transmitted from the initiating website to the sending wallet? If they were sent as query parameters to the mediator who then forwarded them on, the mediator could intercept and man-in-the-middle any payment request.

Since the authorization portal will only accept payment details via a `postMessage` from the window that opened it, it's not possible for the mediator (which is only loaded into the popup window itself) to send a message ...

TODO: What if mediator opens another popup window and posts messages to it (on click), without ever sending the selected wallet to the opener window? Does this defeat the `postMessage` scheme?

- Would the user recognize this?
- Can the authorization portal identify if it's window.opener is a top-level context, or if a message came from a top-level context?
  - Should it reject any messages from the mediator's origin? But the mediator could trivially redirect to another page, which then opens a new popup and posts a message.

~~The authorization portal MUST ensure it was opened with a top-level context using this check: `window.opener.top === window.opener.self`. (For reference: a cross-origin popup can read the hierarchy of all frames in the opener window, but simply cannot access or set any properties, other than `window.location`.)~~

~~This check prevents:~~

1. ~~A compromised mediator from opening another popup window to the authorization portal and using `postMessage` to transmit the payment details.~~
2. ~~A XSS attack that injects an `<iframe>` into the initiating website with a new payment button, hosted from a different domain. Then, the authorization portal would not know the true top-level origin that initiated the payment request. If the initiating website hosted a static list of allowed payment pointers, that would be rendered moot since the authorization portal would fetch this list from an attacker-controlled origin. However, if the initiating origin is displayed to the user, they might be able to recognize the payment was compromised.~~

\*Also, the authorization portal should serve headers such as `X-Frame-Options: DENY` to prevent it from embedded within an `<iframe>`, for example, if the merchant site was compromised.

\*It should probably also use Chrome's new `Sec-Fetch-` headers to enforce this

### User interaction required to open authorization portal

With the pop-up window approach, is one advantage that it likely requires user interaction, since otherwise the pop-up would be blocked?

So, a user could never click a link, e.g. in a native app, which opens the mediator & a payment authorization page directly; links would always need to be to some intermediary page, then the user would click the payment button, which opens a new window for their wallet

### Mediator privacy

What if it sent the registered wallets back to the merchant/initiating page, then that the webpage, either through a redirect, or other mechanism, rendered the selection sheet?

Basically, in case of mediator compromise, how do you check against the mediator saying "the user registered [a.com](http://a.com) as a wallet" if a.com was never actually registered and is controlled entirely by the mediator? (so they can exfiltrate, but not tamper with, payment details)

So — I think we can make the payment fail if they exfiltrate the payment details — but I don't think it can be prevented entirely

(Legitimate means intended by user, illegitimate means unintended)

1. Payment request initiated from legitimate origin, but recipient/amount is mutated.
   1. Mediator is secure.
      - So, if we go with the "mediator claims it originated from X," then in this case, the sending wallet knows the legitimate origin the request originated from.
      - Would a sandboxed <iframe&gt; prevent against this? (\*however, this wouldn't prevent against other buttons on that page)
        - There is an `allow-popups-to-escape-sandbox` property (?)
        - Would this complicate other approaches?
   2. Mediator is compromised; initiating page is secure (what if both are compromised?).
      - TODO
      - Is it possible this still protects against mediator compromise?
      - Consider if the mediator redirects to the legitimate sending wallet. Then, the sending wallet waits for a postMessage. it must be sent from the parent window, since that's the only one that'd have a handle to it.
      - But wait! The mediator has the ability to redirect the parent window via `window.opener.location`. Then, it could redirect the parent to an origin it controls, and send a postMessage with arbitrary payment data, compromising this scheme.
      - Is there a way to prevent this malicious redirect while still allowing postMessage?
        - If not, then using postMessage will not secure payment information against a compromised mediator.
2. Payment request initiated from illegitimate origin, with arbitrary recipient/amount.
   - TODO

### Why is identity simpler here?

Attestations simplify the identity problem because of the incentive structure: anyone could embed any payment pointer within a Twitter account they control, but they're not incentivized to do that if that's someone else's payment pointer!

I believe this is unique to the payment use case — simplifies this

We don't need prove you're actually paying the third party identity we present, only that that identity would not be incentivized to have you pay any other account

## Mediator notes

- Validate `Sec-Fetch-Mode` request header, if available, to ensure it's `navigate`?
  - `navigate` indicates a top-level navigation request
  - Sent by Chrome, Edge, Firefox, so not always available
  - [More info here](https://web.dev/fetch-metadata/)
  - [Here's a good example of how this should be implemented server-side](https://web.dev/fetch-metadata/#step-5:-reject-all-other-requests-that-are-cross-site-and-not-navigational)
- Use [HSTS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security) to tell browsers it only works over HTTPS:

  ```
  Strict-Transport-Security: max-age=1000; includeSubDomains; preload
  ```

- Should it have a strict CSP ruleset?
- `X-Frame-Options` to prevent mediator page from embedded within an `<iframe>` (\*hopefully this excludes the payment handler window). → prevents click-jacking
  - Also use this more modern header, `Content-Security-Policy: frame-ancestors <source>`: [https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors)
- `[Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy)` to ensure the new window isn't shared with other cross-origin documents: e.g. if opened in a popup, `window.opener` will be `null`, and the opening document also won't have a reference to the popup.
  - Note: only supported in Chrome/Edge, Firefox; not Safari
- Cross-origin AJAX requests to this page should be prevented, right? So, disable cross-origin requests/resource sharing

### Mediator verification of origin

[Referer and Referrer-Policy best practices](https://web.dev/referrer-best-practices/#payments)

TL;DR, for payment providers in a cross-origin flow:

1. You can use `Referer` as a naive check to ensure where the redirect came from.
2. The problem is, the embedding site might set the HTTP `[Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy)` header a `no-referrer` policy, or the agent could strip referrers (does Brave do this? Does Safari only downgrade?). So, what do you do when there's no referrer?

   &gt; One reliable verification method is to let the requester hash the request parameters together with a unique key. As a payment provider, you can then calculate the same hash on your side and only accept the request if it matches your calculation.

   → So, requester and payment provider have a shared key.

   → Where is the hashing of the request parameters performed? Is that server-side? But then the key would need to be exchanged with the merchant in advance?

## Mediator

Could the mediator look at the `Origin` or `Referer` headers and forward that on as a parameter to the sending wallet? Then, the sending wallet could verify the request came from the mediator's origin (?)

→ this just seems...bad

Also, assume that anyone with push access to any other [interledger.org](http://interledger.org) static page (e.g. depending upon how it's hosted) could upload a custom page that redirected to the wallet's payment authorization page — even if hosted on a different subdomain than the mediator?

- Does this just mean it'd need to be hosted on a different subdomain from the docs site, etc.?
- Would the redirects need to be signed by [interledger.org](http://interledger.org) in some way in order to be secure?

But, the origin can still be foiled by XSS, right? If there's any arbitrary or malicious JavaScript that can be executed in the context of the initiating page ... then the displaying that domain as initiating the request is moot.

→ Double bind: tip button cannot be sandboxed inside a Coil-hosted `<iframe>` (then the initiating domain would be coil), but if it's running in the top-level context then the button, etc., is vulnerable to other malicious JavaScript in the page

→ Would we want to sandbox the tip button within its own `<iframe>`?

→ Create a more robust comparison of these approaches (`postMessage`, Origin/Referer headers, well known hosted public key with signed payment request)

TODO — explain different payment contexts?

TODO — explain mediator? explain why it's necessary?

### Alternatives

- Use interledger `PaymentRequest` API with list of known Interledger provider URLs? But then how should onboarding work? In that case, should the client code default to a particular provider?
  - Maybe it's fine for the Interledger foundation to publish a payment manifest with a list of providers if Coil needs the functionality to automatically register itself, even with the mediated flow?

# Authorizing payments

TODO: moved up

## Motivation

To motivate the design of this specification, some information is insufficient to identify the recipient to the user:

1. **Profile photos, display names, etc.** As long as the information is prescribed by the recipient without any independent verification, the recipient can trivially impersonate a different entity.
2. **Domain of the initiating website.** For payments initiated from the web, one option is for the authorization portal to display the domain that the payment was requested from, so the user could ascertain whether they actually came from and want to pay that site. However, there are a number of problems with this:
   - Phishing: most users cannot identify phishing attempts, and don't understand the security model of URLs (add links). Browsers also have very complex protection against lookalike internalized domain names and misspellings, which might need to be reimplemented to achieve similar levels of protection.
   - Not applicable to native apps: if native apps initiate a payment request to another native app, there's no initiating domain to display to the user. It may be possible to display the app that requested the payment, but ...
   - TODO — is there a trusted way for the sending wallet to know which site initiated the request? e.g. or should it check/ensure the request came from interledger.org?
   - Complexity: this flow might require the initiating site to manage private keys and sign each payment request, requiring non-trivial server-side code.
     - Alternatively, leveraging web APIs such as `postMessage` to ascertain the origin that requested the payment may be used, although this requires multiple browser windows, which may not always be possible: e.g., if the provider uses a mobile app, or an in-app browser which might need a redirect-based flow — explain this better
       - In the redirect case, would Referer checks help at all? Or is that still super insecure?
   - Limited context: this only works if the payment is requested from a website, but does not address other contexts, such as payments initiated from a mobile application or from scanning a QR code.
3. **Domain of the payment pointer.** Presenting the domain of the payment pointer succumbs to some of the same pitfalls as the domain that initiated the context, with additional caveats. Since many recipients will use the same wallet provider instead of hosting vanity payment pointers from their own domain, the payment pointer is almost useless in discerning an intended payment recipient from a fraudulent one.

Consider these potential attacks:

- **Attack idea #1**

  A malicious attacker accesses the tranche of leaked Coil user email addresses.

  Then, the attacker sends a phishing email to every Coil user saying their subscription payment was declined, with a link to retry the payment. If the user clicks the link, it navigates (either directly or through the mediator) to the Coil payment authorization page, which to the user may appear legitimate since it's on the [coil.com](http://coil.com) domain.

  The attacker requests a payment to an account they control. However, if they can set the name and photo of the recipient of the payment, they could abuse this to masquerade as if the user is paying their Coil subscription.

- **Attack idea #2**

  An attacker phishes and compromises an Interledger Foundation employee to gain credentials to the mediator hosting infrastructure. Then, they deploy a malicious version which "man-in-the-middles" payments to redirect some or all payments to their own account.

  Without authenticated identity information to present, neither the user nor sending wallet might know the payment was MiTM-ed, since other metadata could be spoofed by the attacker.

## Improving recipient identification

To minimize unintended or fraudulent payments, the authorization portal should inform users of the identity of the recipient through **attestations**. Attestations are optional extensions to the payment request which link a public-facing identity of the recipient, such as social profile, to the Interledger account requested to be paid.

Furthermore, an improved implementation may even inform the user of if or how they're connected to the payment recipient on common public platforms or social networks.

If any recipient could request payments while providing no or limited attestations of identity, this would compromise the security of the entire scheme. Users should not be relied upon to discern when critical identity information is absent or not presented to them. Rather, the authorization portal should enforce a minimum policy of how identity is attested and block or flag payment requests that don't meet their minimum policy.

### Prevent accidental repeat payments

TODO — problem, what if a site requests a payment, user pays, then it says "we didn't receive it, try again" — so the user goes through that flow again, and sends another payment... what prevents them from doing that?

### Repeat recipients

Note that this is an optional extension?

The authorization portal and/or issuer are RECOMMENDED to track which the Open Payments/SPSP account URLs a user has paid to previously, and display whether the user has paid that entity in the past.

If not, they SHOULD prominently indicate if this is the first instance transacting with this recipient.

### Trusted recipient providers

In future versions of Open Payments, wallets may expose optional payment details — TODO

This is for future extension, but we should explain how this would work

TODO — some recipient wallets are trusted (by domain), and return special metadata

### Intra-provider

An Interledger provider may maintain their own registry of user accounts and require their users to verify their identity as a prerequisite to service. If a payment is requested between two accounts that happen to both be serviced by the same provider, they may use their own method to display to the sender the identity of the recipient. They should ensure that another user they service cannot spoof the payer into believing there's a different recipient.

Providers can check if they also service the recipient by resolving the payment details and checking if the destination ILP address is prefixed with their own address (since the recipient could use a vanity payment pointer).

TODO — should the final account URL after redirects represent the unique account URL, or should it be the vanity payment pointer before any redirects?

### Extension: Twitter

1. Recipient includes their payment pointer, separated by whitespace characters, somewhere in the bio of their public-facing Twitter account.
2. When recipient's initiation software requests a payment, it includes an ...

TODO

#### Twitter Extension Fields

| ﻿Name           | Description                                                                                                    | Example |
| :-------------- | :------------------------------------------------------------------------------------------------------------- | :------ |
| twitterUsername | Username of the Twitter account attesting ownership of the provided account URL (with no "@" symbol included). |         |
| tweetUrl        | TODO                                                                                                           |         |

### Extension: GitHub

TODO — options

1. GitHub bio
2. Well known GitHub repo
3. File within `dotfiles` repo
4. Gist with URL provided
5. Provide a link to any file hosted in a repo by that GitHub user? Simplifies it, so long as this doesn't weaken security

# Payment outcome

TODO — specify a different URI/callback for the payment outcome, e.g., delivered, STREAM receipt, etc.?

Should it the sender attest whether payment succeeded or failed?

# Misc. drafts

**Architecture constraints —**

**~~Third party cookie limitations** — TODO~~

**~~Limited payment API support —** Safari on iOS and Mac, Firefox, and some mobile Chromium variants → no payment handlers ...~~

**~~Mediator does not recommend nor federate wallets** —~~

**~~Registration Flow~~**

1. ~~Wallet displays UI asking the user to save it as a payment method~~
   - (This might include some introduction to "Interledger/Open Payments" as a brand)
2. ~~Wallet redirects the user to `https://interledger.org/web/register?wallet_host=<host>&callback_url=<url>`~~
3. ~~Mediator (e.g. interledger.org) renders prompt asking if the user wants to save the wallet~~
   - Mediator fetches web app manifest for that host, and displays its URL, name, icon & description
   - User approves or denies if they want to save that wallet
   - Wallet host is saved in an HTTP cookie with the mediator
4. ~~Mediator redirects to the callback URL (likely back the wallet that initiated the redirect): `<callback_url>?registered=true`~~

**Protecting against abusive wallets**

To prevent abusive wallets from persistently requesting the user to register themselves, the mediator could also set a cookie with a list of declined wallets. If a user declined to register a particular wallet twice, and that wallet tried to register itself in the future, the user would not be asked to register the wallet, and would be automatically redirected back to the callback URL without any user interaction.

**Why doesn't this use a Coil-branded button?**

Requiring the website to add a branded button prevents new providers from sending payments to that website, unless the website manually added code to reference that new provider. This limits the openness of this ecosystem.

Due to third-party tracking limitations, it's infeasible in many browsers to dynamically render the button branded according to any wallets the user has already registered.

Lastly, using a branded button doesn't communicate interoperability: if users aren't introduced to another payment brand, they may not understand that Coil users can e.g. pay Uphold users.

So, as proposed by others, this flow leverages a neutral payment brand as a "feature" that Coil and other wallets can support.

**If so, what brand name should be introduced to users?**

Open Payments has [great brand guidelines](https://openpayments.dev/brand-guidelines), and is currently used as the brand in this flow. However, I have some concerns labeling this flow as "Open Payments" or a variant of that:

- "Open Payments" is a relatively generic phrase and SEO may prove very challenging (a Google search currently yields a result on the 4th page)
- Is "Open Payments" usable as a brand without infringing on other copyright/trademark claims? Does the ILF have the rights for this?
- Calling the flow "Open Payments"—without an additional phrase—collides with other meanings of "Open Payments," such as the payment setup protocol rather than this higher-layer payment initiation flow

**What domain name should host the mediator?**

- [openpayments.dev](http://openpayments.dev), if used as the domain of the mediator, uses an obscure (and possibly less-trusted) gTLD: ".dev"
- By contrast, "interledger.org" uses a more well-understood gTLD. Due to the high risk of phishing, user trust and identification is very important here.
- Using a conflicting brand name and mediator domain could be confusing, depending upon the branding of this flow

**Mediator availability → no payments**

Stateless backend → should be relatively easy to scale

BUT, if it goes down, no payments can occur!

Can there be any kind of fallback mechanism to this?

**Cookies in Brave**

&gt; "Cookies are given a maximum lifetime of 7 days for cookies set through Javascript and 6 months for cookies set through HTTP"
Source: [Brave wiki](<https://github.com/brave/brave-browser/wiki/Deviations-from-Chromium-(features-we-disable-or-remove)#modified-features-and-functionality>)

**Mediator cookies are cleared/unavailable**

If the user manually clears cookies or gets a new device, linking the user's existing wallets may prove challenging.

Consider the user gets a fresh device, and then checks out online without already logging into their wallet (which would try to register it with the mediator). The mediator will treat it as if the user has no wallet and displays wallets recommended by the merchant. If one of these recommendations is the wallet already used by the user, it's simple enough for them to select it and then log in. However, if the user's wallet is not one of the recommendations, how do they select it?

For the foreseeable future, Coil will likely be included in each merchant's recommendation list, so it shouldn't affect Coil users. But if a new wallet comes along, re-onboarding users may be challenging.

As a stop-gap until we think of a better solution, [Interledger.org](http://interledger.org) could display guidance such as "Don't see your wallet here? Sign-in to it first." If the wallet had registration in its sign-up flow, this would configure it.

**Automatic redirect to default wallet, but user wants to choose a different one**

TODO

Possible solution: each wallet could individually include a link to select a different wallet (though it's unclear if they're incentivized to do this).

**Future tracking limitations**

TODO

**Safari bounce-tracking limitations**

&gt; What the SameSite=strict jail does is detect bounce tracking and, at a certain threshold, rewrite all the tracking domain’s cookies to SameSite=strict. **This means that they will not be sent in cross-site, first-party navigations**, and they can no longer be used for simple redirect-based bounce tracking.
Our implementation is rather relaxed, **with the threshold set to 10 unique navigational, first-party redirects** (unique in the sense of going to unique domains), and an automatic reset of that counter once the cookies are rewritten to SameSite=strict. This automatically gives the domain a new chance so that they can disengage in bounce tracking and “get out of jail.”

[CNAME Cloaking and Bounce Tracking Defense](https://webkit.org/blog/11338/cname-cloaking-and-bounce-tracking-defense/)

[Bounce Tracking Protection · Issue #6 · privacycg/proposals](https://github.com/privacycg/proposals/issues/6)

Web Privacy WG bounce tracking discussion — hard to differentiate from SSO, OAuth flows

[privacycg/meetings](https://github.com/privacycg/meetings/blob/master/2020/telcons/04-23-bouncetracking-minutes.md)

So, for example, if the users makes payments on 10 different websites, the mediator's cookies will be limited to `SameSite=Strict`, which means they won't be sent on the initial top-level navigation. We can assume this is the case and instead have the mediator page itself make subresource request, which will include cookies... then programmatically redirect to the wallet. However, we should be vigilant if browsers further restrict this.

Safari and other browsers want to further protect against redirect-based bounce tracking, and one proposal [mentioned in this meeting](https://github.com/privacycg/meetings/blob/master/2020/telcons/04-23-bouncetracking-minutes.md) is to add an interstitial or prompt asking the user if they want to continue. (Their problem is that federated logins—which use a flow similar to ours—are indistinguishable from redirect-based bounce trackers).

**Design / should parameters be included in SPSP request vs URI**

- Can the content security policy of the website be resolved from the payment pointer itself? No, because if the PP is mutated by XSS then the attacker could change the CSP/which payment pointers are allowed! So, CSP needs to be separate from PP itself. But, it can't be sent in the payment request either? It needs to be statically hosted, right?

_Should this functionality be offloaded to the SPSP/Open Payments server?_

You could imagine, just a payment pointer is exchanged between the two parties (or invoice URL?). Using that payment pointer, all the relevant information is resolved: asset details, amount to deliver (if invoice), identity information

What's the advantage vs disadvantage of initiating context → some details directly, vs requesting them from recipient wallet?

Advantage of initiating context: the metadata can be statically configure! You go to HTML generator page, or WP plugin, and input your information... and then it's all configured. Versus otherwise, the receiving wallet has to offer the functionality to configure all of this.

One way to look at this: STREAM resolution could be limited to ILP/STREAM infra? i.e., other constrains, like identity/authorization don't need to be supported there?

Ask Ben about this?

Problems this solves:

- Choosing among different types of OP payments: tip, invoice, mandate...
- Backwards compatibility: SPSP + fixed delivery payments
- Attesting identity
- Does not put additional constraints on recipient wallet

Why wouldn't you want to return domain or Twitter user from the SPSP response and instead share it out of band/separately? For example, what if you want multiple Twitter identities payable to the same payment pointer?

- Or, should a single Twitter identity be able to say payment is allowed at multiple payment pointers?

It's like...which one is one to many vs many to one
