const { createHmac } = require('crypto')
const { canonicalize } = require('json-canonicalize')
const fetch = require('node-fetch')
const url = require('url')

const scripts = {
  sanitizeUrl: function () {
    return req
      .getUrl()
      .replace(
        /{{([A-Za-z]\w+)}}/g,
        (_, key) => bru.getVar(key) || bru.getEnvVar(key)
      )
      .replace(/localhost:([3,4])000/g, (_, key) =>
        key === '3' ? bru.getEnvVar('host3000') : bru.getEnvVar('host4000')
      )
  },

  sanitizeBody: function () {
    let requestBody = req.getBody()
    if (!(req.getMethod() === 'POST' && requestBody)) return undefined
    if (typeof requestBody === 'object') {
      requestBody = JSON.stringify(requestBody)
    }
    return JSON.parse(
      requestBody
        .replace(
          /{{([A-Za-z]\w+)}}/g,
          (_, key) => bru.getVar(key) || bru.getEnvVar(key)
        )
        .replace(/http:\/\/localhost:([3,4])000/g, (_, key) =>
          key === '3'
            ? 'https://' + bru.getEnvVar('host3000')
            : 'https://' + bru.getEnvVar('host4000')
        )
    )
  },

  sanitizeHeaders: function () {
    return JSON.parse(
      JSON.stringify(req.getHeaders()).replace(/{{([A-Za-z]\w+)}}/g, (_, key) =>
        bru.getEnvVar(key)
      )
    )
  },

  requestSigHeaders: async function (url, method, headers, body) {
    const response = await fetch(bru.getEnvVar('signatureUrl'), {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: bru.getEnvVar('clientKeyId'),
        base64Key: bru.getEnvVar('clientPrivateKey'),
        request: {
          url,
          method,
          headers,
          body: JSON.stringify(body)
        }
      })
    })
    return await response.json()
  },

  setHeaders: function (headers) {
    for (let [key, value] of Object.entries(headers)) {
      req.setHeader(key, value)
    }
  },

  addSignatureHeaders: async function () {
    const url = this.sanitizeUrl()
    const headers = this.sanitizeHeaders()
    const body = this.sanitizeBody()
    req.setBody(body)
    const signatureHeaders = await this.requestSigHeaders(
      url,
      req.getMethod(),
      headers,
      body
    )
    this.setHeaders(signatureHeaders)
  },

  addApiSignatureHeader: function () {
    const body = this.sanitizeBody()
    const { variables } = body
    const formattedBody = {
      ...body,
      variables: JSON.parse(variables)
    }

    const timestamp = Math.round(new Date().getTime() / 1000)
    const version = bru.getEnvVar('apiSignatureVersion')
    const secret = bru.getEnvVar('apiSignatureSecret')
    const payload = `${timestamp}.${canonicalize(formattedBody)}`
    const hmac = createHmac('sha256', secret)
    hmac.update(payload)
    const digest = hmac.digest('hex')

    req.setHeader('signature', `t=${timestamp}, v${version}=${digest}`)
  },

  addHostHeader: function (hostVarName) {
    const requestUrl = url.parse(
      req.getUrl().replace(/{{([A-Za-z]\w+)}}/g, (_, key) => bru.getEnvVar(key))
    )

    if (hostVarName) {
      bru.setEnvVar(hostVarName, requestUrl.protocol + '//' + requestUrl.host)
    }

    if (requestUrl.hostname === 'localhost') {
      const hostHeader =
        requestUrl.port === '3000'
          ? bru.getEnvVar('host3000')
          : bru.getEnvVar('host4000')
      req.headers.host = hostHeader
    }
  },

  storeTokenDetails: function () {
    const body = res.getBody()
    bru.setEnvVar('accessToken', body?.access_token?.value)
    bru.setEnvVar('continueToken', body.continue.access_token.value)
    bru.setEnvVar('continueId', body.continue.uri.split('/').pop())
    bru.setEnvVar('tokenId', body?.access_token?.manage.split('/').pop())
  },

  getWalletAddressId: async function (host, publicName, varName) {
    const getWalletAddressesQuery = `
    query GetWalletAddresses {
        walletAddresses {
            edges {
                cursor
                node {
                    id
                    publicName
                    url
                }
            }
        }
    }`

    const postRequest = {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: getWalletAddressesQuery })
    }

    const response = await fetch(`${bru.getEnvVar(host)}/graphql`, postRequest)
    const body = await response.json()
    const walletAddressId = body.data.walletAddresses.edges
      .map((e) => e.node)
      .find((node) => node.publicName === publicName)?.id
    bru.setEnvVar(varName, walletAddressId)
  }
}

module.exports = scripts
