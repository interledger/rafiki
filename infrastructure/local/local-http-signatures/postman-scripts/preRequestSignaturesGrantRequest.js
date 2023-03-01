const url = require('url')

const body = JSON.parse(request.data)
const client = url.parse(body.client)
const jwkUrl = `http://localhost:${
  client.host === 'cloud-nine-wallet-backend' ? '3' : '4'
}000${client.path}/jwks.json`
pm.collectionVariables.set(
  'signatureUrl',
  pm.collectionVariables.get(
    client.host === 'cloud-nine-wallet-backend'
      ? 'SignatureHost'
      : 'PeerSignatureHost'
  )
)

const requestUrl = request.url.replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
  pm.collectionVariables.get(key)
)
const requestBody = request.data.replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
  pm.collectionVariables.get(key)
)
const requestHeaders = JSON.parse(
  JSON.stringify(request.headers).replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
    pm.collectionVariables.get(key)
  )
)

// Request Client JWK
pm.sendRequest(
  {
    url: jwkUrl,
    method: 'GET',
    header: {
      Host: client.host
    }
  },
  (err, res) => {
    const keys = res.json()
    pm.collectionVariables.set('keyId', keys.keys[0].kid)

    // Request Signature Headers
    pm.sendRequest(
      {
        url: pm.collectionVariables.get('signatureUrl'),
        method: 'POST',
        header: {
          'content-type': 'application/json'
        },
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            keyId: pm.collectionVariables.get('keyId'),
            request: {
              url: requestUrl,
              method: request.method,
              headers: requestHeaders,
              body: requestBody
            }
          })
        }
      },
      (_, res) => {
        const headers = res.json()
        for (let [key, value] of Object.entries(headers)) {
          pm.request.headers.add({ key, value })
        }
      }
    )
  }
)
