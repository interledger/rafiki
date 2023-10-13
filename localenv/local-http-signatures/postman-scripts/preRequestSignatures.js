let requestUrl = request.url
  .replace(/{{([A-Za-z]\w+)}}/g, (_, key) => pm.environment.get(key))
  .replace(/localhost:([3,4])000/g, (_, key) =>
    key === '3' 
      ? pm.environment.get('host3000')
      : pm.environment.get('host4000')
  )

const requestBody =
  request.method === 'POST' && Object.keys(request.data).length !== 0
    ? request.data
        .replace(/{{([A-Za-z]\w+)}}/g, (_, key) => pm.environment.get(key))
        .replace(/http:\/\/localhost:([3,4])000/g, (_, key) =>
            key === '3' 
                ? 'https://' + pm.environment.get('host3000')
                : 'https://' + pm.environment.get('host4000')
        )
    : undefined
pm.request.body.raw = requestBody

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
        keyId: pm.environment.get('clientKeyId'),
        base64Key: pm.environment.get('clientPrivateKey'),
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