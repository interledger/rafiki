const url = require('url')

const body = JSON.parse(request.data)
const client = url.parse(body.client)
const jwkUrl = `http://localhost:${
  client.host === 'cloud-nine-wallet-backend' ? '3' : '4'
}000${client.path}/jwks.json`

const requestUrl = request.url.replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
  pm.environment.get(key)
)
const requestBody = request.data.replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
  pm.environment.get(key)
)
const requestHeaders = JSON.parse(
  JSON.stringify(request.headers).replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
    pm.environment.get(key)
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
    pm.environment.set('keyId', keys.keys[0].kid)

    // Request Signature Headers
    pm.sendRequest(
      {
        url: pm.environment.get('signatureUrl'),
        method: 'POST',
        header: {
          'content-type': 'application/json'
        },
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            keyId: pm.environment.get('keyId'),
            base64Key: pm.environment.get('pfryPrivateKey'),
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
