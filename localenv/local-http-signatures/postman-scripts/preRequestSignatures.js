const requestUrl = request.url
  .replace(/{{([A-Za-z]\w+)}}/g, (_, key) => pm.environment.get(key))
  .replace(/localhost:([3,4])000/g, (_, key) =>
    key === '3' ? 'cloud-nine-wallet-backend' : 'happy-life-bank-backend'
  )
const requestBody =
  request.method === 'POST' && Object.keys(request.data).length !== 0
    ? request.data.replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
        pm.environment.get(key)
      )
    : undefined
const requestHeaders = JSON.parse(
  JSON.stringify(request.headers).replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
    pm.environment.get(key)
  )
)

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
