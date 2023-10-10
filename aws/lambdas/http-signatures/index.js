import { loadBase64Key, createHeaders } from '@interledger/http-signature-utils'

const validateBody = (requestBody) =>
  !!requestBody.keyId &&
  !!requestBody.base64Key &&
  !!requestBody.request.headers &&
  !!requestBody.request.method &&
  !!requestBody.request.url

export const handler = async function (event) {
  const requestBody = JSON.parse(event.body)

  if (!validateBody(requestBody)) {
    return {
      statusCode: '400',
      body: 'Unsufficient data in request body'
    }
  }

  const { base64Key, keyId, request } = requestBody

  let privateKey

  try {
    privateKey = loadBase64Key(base64Key)
  } catch {
    return {
      statusCode: '400',
      body: 'Not a valid private key'
    }
  }

  if (privateKey === undefined) {
    return {
      statusCode: '400',
      body: 'Not an Ed25519 private key'
    }
  }

  const headers = await createHeaders({
    request,
    privateKey,
    keyId
  })
  delete headers['Content-Length']
  delete headers['Content-Type']

  return {
    statusCode: '200',
    body: JSON.stringify(headers),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
