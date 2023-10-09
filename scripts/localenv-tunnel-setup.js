let tunnelmole

const fs = require('fs')
const ngrok = require('ngrok')
const dotenv = require('dotenv')
const { v4 } = require('uuid')

const envFile = './localenv/cloud-nine-wallet/.env'
function checkExistingEnvFile() {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile })

    // remove the existing .env file
    // the docker containers will start after .env file is recreated
    fs.unlinkSync(envFile)
  }
}

function getEnvs(opUrl, authUrl, connectorUrl) {
  return Object.entries({
    // set to "testing" as in "development" - op client is replacing https with http
    NODE_ENV: 'testing',
    TRUST_PROXY: true,
    TESTNET_AUTOPEER_URL: 'https://autopeer.rafiki.money',
    ILP_ADDRESS: process.env.ILP_ADDRESS || `test.local-playground-${v4()}`,
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

async function createNgrokTunnel(port) {
  const tunnel = await ngrok.connect(port)

  console.log(`Created tunnel for port ${port}: ${tunnel}`)
  return tunnel
}

async function connect() {
  console.log('Starting the tunnels and preparing .env file...')

  checkExistingEnvFile()

  // import es module
  tunnelmole = (await import('tunnelmole')).tunnelmole

  // use ngrok for X-Forwarded-Proto header
  const openPaymentsUrl = await createNgrokTunnel(3000)
  const authUrl = await createNgrokTunnel(3006)

  const connectorUrl = await createTunnel(3002)

  await fs.writeFileSync(
    './localenv/cloud-nine-wallet/.env',
    getEnvs(openPaymentsUrl, authUrl, connectorUrl)
  )

  console.log('Tunnels and .env file are ready!')
}

connect()

process.on('SIGINT', function () {
  console.log('Tunnels are closing...')

  process.exit()
})
