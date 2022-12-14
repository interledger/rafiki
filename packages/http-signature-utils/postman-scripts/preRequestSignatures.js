const requestUrl = request.url
  .replace(/{{([A-Za-z]\w+)}}/g, (_, key) => pm.collectionVariables.get(key))
  .replace(/localhost:([3,4])000/g, (_, key) =>
    key === '3' ? 'backend' : 'peer-backend'
  )
const requestBody =
  request.method === 'POST'
    ? request.data.replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
        pm.collectionVariables.get(key)
      )
    : undefined
const requestHeaders = JSON.parse(
  JSON.stringify(request.headers).replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
    pm.collectionVariables.get(key)
  )
)

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
