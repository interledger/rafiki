# Key Registry

## Sequence Diagram

TODO: add sequence diagram

## Basics

### What is the key registry?

A key registry is a list of keys stored by a client. A key is generated and added to the registry by a client and exposed publically at the path `/jwks.json` in anticipation of a grant request on an authorization server (AS).

### What is the purpose of the key registry?

The key registry allows an AS to verify that a client is who they say they are. Because a grant request is completed over multiple HTTP requests it is thus important for a client to provide a way to consistently identify itself across these requests to the AS.

### How is this achieved?

The client will generate an asymmetric key pair, which should include a key id identifying them. When the client makes a grant request, it should include a signature in the header signed by the private key and a `Signature-Input` header that, among other things, should include the key id of the public key associated with the private key used to sign the signature.

When the AS receives a signed grant request, it first acquires the key registry exposed by the client by making a `GET` request on its `/jwks.json` endpoint. The domain of the client is acquired by the AS during the initial grant request, after which the AS binds it to the grant and uses it to acquire the key registry for susequent grant requests.

Once the AS has acquired the client's key registry, it searches for the public key with a key id that matches the one included in the `Signature-Input` header. Once it finds it, the public key will be used to decrypt and verify the signature. Then the AS will proceed with the grant request.

## JWK

### Key Structure

A key registry should expose public keys in the form of a JWK. They should be generated using the `ed25519` algorithm, and the resultant JWK should have fields with the following values:

```
// Key should also have a `kid` field to identify it in a signature
// Public keys should contain the `x` field
{
  alg: 'EdDSA',
  kty: 'OKP',
  crv: 'Ed25519'
}
```

The private key should be used to sign the payload described in the httpsig signature method.

## Signature

### Signature Method

The signature is formatted and verified using the [httpbis-message-signature](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-16) method.

In general, a request secured with the `httpsig` method contains two headers, the `Signature` and the `Signature-Input`. The `Signature` is data signed by the algorithm specified in the JWK, and the signature input is a comma-separated list of headers that map to values in the data that was signed. These values should match the values provided in the headers of a signed GNAP request.

### Signature Base

The components of the signature base correspond to components of the HTTP request that it is supposed to sign, as described in the [GNAP core protocol](https://datatracker.ietf.org/doc/html/draft-ietf-gnap-core-protocol#section-7.3.1).

The following components must be included:

- **@method**: The method used in the HTTP request.
- **@target-uri**: The full request URI of the HTTP request.

If the request has a body:

- **content-digest**: The Content-Digest header of the request. It should contain

If the request has an authorization header:

- **authorization**: The authorization header used to present an access token.

- **@signature-params**: A list of the metadata in the signature base, comprised primarily of a space-separated list of quote-enclosed component names further grouped in parentheses, a timestamp for when it was created, and the keyid of the key that signed it.
  **NOTE:** `@signature-params` MUST be the last component listed in the signature base.

Each component should be on a separate line. The component name should be in quotes, followed by a colon, then a space, then the value of the component.

#### Signature Base Example

```
"@method": POST
"@target-uri": https://server.example.com/gnap
"content-digest": \
  sha-256=:q2XBmzRDCREcS2nWo/6LYwYyjrlN1bRfv+HKLbeGAGg=:
"content-length": 988
"content-type": application/json
"@signature-params": ("@method" "@target-uri" "content-digest" \
  "content-length" "content-type");created=1618884473\
  ;keyid="gnap-rsa"
```

### Signature Input Example

```
Signature-Input: sig1=("@method" "@target-uri" "content-digest" \
  "content-length" "content-type");created=1618884473\
  ;keyid="gnap-rsa";nonce="NAOEJF12ER2";tag="gnap"
```
