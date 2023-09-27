let tunnelmole
// eslint-disable-next-line
const fs = require('fs')

function getEnvs(opUrl, authUrl, connectorUrl) {
  return Object.entries({
    CLOUD_NINE_PUBLIC_HOST: opUrl,
    CLOUD_NINE_OPEN_PAYMENTS_URL: opUrl,
    CLOUD_NINE_PAYMENT_POINTER_URL: `${opUrl}/.well-known/pay`,
    CLOUD_NINE_AUTH_SERVER_DOMAIN: authUrl,
    CLOUD_NINE_CONNECTOR_URL: connectorUrl
  })
    .map((entry) => entry.join('='))
    .join('\n')
}

async function createTunnel(port) {
  const tunnel = await tunnelmole({ port })

  console.log(`Created tunnel for port ${port}: ${tunnel}`)
  return tunnel
}

async function connect() {
  // import es module
  tunnelmole = (await import('tunnelmole')).tunnelmole

  const openPaymentsUrl = await createTunnel(3000)
  const authUrl = await createTunnel(3006)
  const connectorUrl = await createTunnel(3002)

  await fs.writeFileSync(
    './localenv/cloud-nine-wallet/.env',
    getEnvs(openPaymentsUrl, authUrl, connectorUrl)
  )
}

connect()
