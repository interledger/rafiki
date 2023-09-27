import {
  loadBase64Key,
  createHeaders
} from '@interledger/http-signature-utils'


const validateBody = (
  requestBody
) =>
  !!requestBody.keyId &&
  !!requestBody.base64Key &&
  !!requestBody.request.headers &&
  !!requestBody.request.method &&
  !!requestBody.request.url

export const handler = async function (event, context) {
  let response
  const requestBody = JSON.parse(event.body)

  if (!validateBody(requestBody)) {
    response = {
      statusCode: '400',
      body: 'Unsufficient data in request body',
    }
    context.succeed(response)
  }

  const { base64Key, keyId, request } = requestBody

  let privateKey 
  
  try {
    privateKey= loadBase64Key(base64Key)
  } catch {
    response = {
      statusCode: '400',
      body: 'Not a valid private key',
    }
    context.succeed(response)
  }

  if (privateKey === undefined) {
    response = {
      statusCode: '400',
      body: 'Not an Ed25519 private key',
    }
    context.succeed(response)
  }

  const headers = await createHeaders({
    request,
    privateKey,
    keyId
  })
  delete headers['Content-Length']
  delete headers['Content-Type']

  response = {
    statusCode: '200',
    body: JSON.stringify(headers),
    headers: {
        'Content-Type': 'application/json',
    }
  }
  context.succeed(response)
}
