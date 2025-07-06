const { createHmac } = require('crypto')
const { canonicalize } = require('json-canonicalize')
const fetch = require('node-fetch')
const url = require('url')

const scripts = {
  resolveTemplateVariables: function (string) {
    const VARIABLE_NAME_REGEX = /{{([A-Za-z]\w+)}}/g

    return string.replace(
      VARIABLE_NAME_REGEX,
      (_, key) => bru.getVar(key) || bru.getEnvVar(key)
    )
  },

  sanitizeUrl: function () {
    return this.resolveTemplateVariables(req.getUrl()).replace(
      /localhost:([3,4])000/g,
      (_, key) =>
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
      this.resolveTemplateVariables(requestBody).replace(
        /http:\/\/localhost:([3,4])000/g,
        (_, key) =>
          key === '3'
            ? 'https://' + bru.getEnvVar('host3000')
            : 'https://' + bru.getEnvVar('host4000')
      )
    )
  },

  sanitizeHeaders: function () {
    return JSON.parse(
      this.resolveTemplateVariables(JSON.stringify(req.getHeaders()))
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

  generateAuthApiSignature: function (body) {
    const version = bru.getEnvVar('authApiSignatureVersion')
    const secret = bru.getEnvVar('authApiSignatureSecret')
    const timestamp = Date.now()
    const payload = `${timestamp}.${canonicalize(body)}`
    const hmac = createHmac('sha256', secret)
    hmac.update(payload)
    const digest = hmac.digest('hex')

    return `t=${timestamp}, v${version}=${digest}`
  },

  generateBackendApiSignature: function (body) {
    const version = bru.getEnvVar('backendApiSignatureVersion')
    const secret = bru.getEnvVar('backendApiSignatureSecret')
    const timestamp = Date.now()
    const payload = `${timestamp}.${canonicalize(body)}`
    const hmac = createHmac('sha256', secret)
    hmac.update(payload)
    const digest = hmac.digest('hex')

    return `t=${timestamp}, v${version}=${digest}`
  },

  addApiSignatureHeader: function (packageName, instance) {
    const body = this.sanitizeBody()
    const { variables } = body
    const formattedBody = {
      ...body,
      variables: JSON.parse(variables)
    }

    let signature
    // Default to backend api secret
    switch (packageName) {
      case 'backend':
        signature = this.generateBackendApiSignature(formattedBody)
        break
      case 'auth':
        signature = this.generateAuthApiSignature(formattedBody)
        break
      default:
        signature = this.generateBackendApiSignature(formattedBody)
    }
    req.setHeader('signature', signature)
    switch (instance) {
      case 'sender':
        req.setHeader('tenant-id', bru.getEnvVar('senderTenantId'))
        break
      case 'receiver':
        req.setHeader('tenant-id', bru.getEnvVar('receiverTenantId'))
        break
      default:
        req.setHeader('tenant-id', bru.getEnvVar('senderTenantId'))
    }
  },

  addHostHeader: function (hostVarName) {
    const requestUrl = url.parse(this.resolveTemplateVariables(req.getUrl()))

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

    if (body?.access_token) {
      bru.setEnvVar('accessToken', body.access_token.value)
      bru.setEnvVar('tokenId', body.access_token.manage.split('/').pop())
    }

    if (body?.continue) {
      bru.setEnvVar('continueToken', body.continue.access_token.value)
      bru.setEnvVar('continueId', body.continue.uri.split('/').pop())
    }
  },

  loadWalletAddressIdsIntoVariables: async function () {
    const requestUrl = this.resolveTemplateVariables(req.url)

    const getWalletAddressesQuery = `
    query GetWalletAddresses {
        walletAddresses {
            edges {
                cursor
                node {
                    id
                    publicName
                }
            }
        }
    }`

    const postBody = { query: getWalletAddressesQuery }

    const postRequest = {
      method: 'post',
      headers: {
        signature: this.generateBackendApiSignature(postBody),
        'Content-Type': 'application/json',
        'tenant-id': bru.getEnvVar('senderTenantId')
      },
      body: JSON.stringify(postBody)
    }

    const response = await fetch(requestUrl, postRequest)
    const body = await response.json()

    // Default accounts defined in localenv/(cloud-nine-wallet | happy-life-bank)/seed.yml files
    const mapFromPublicNameToVariableName = {
      "World's Best Donut Co": 'wbdcWalletAddressId',
      'Bert Hamchest': 'bhamchestWalletAddressId',
      'Grace Franklin': 'gfranklinWalletAddressId',
      'Philip Fry': 'pfryWalletAddressId',
      'PlanEx Corp': 'planexWalletAddressId',
      Lars: 'larsWalletAddressId',
      David: 'davidWalletAddressId'
    }

    body.data.walletAddresses.edges
      .map((e) => e.node)
      .forEach((wa) => {
        const varName = mapFromPublicNameToVariableName[wa.publicName]
        if (varName) {
          bru.setEnvVar(varName, wa.id)
        }
      })
  }
}

module.exports = scripts
