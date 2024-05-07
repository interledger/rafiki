const fs = require('fs')
const dotenv = require('dotenv')
const { v4 } = require('uuid')
const localtunnel = require('localtunnel')

let envs

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
  return {
    // set to "autopeer" as in "development" - op client is replacing https with http
    NODE_ENV: 'autopeer',
    TRUST_PROXY: true,
    TESTNET_AUTOPEER_URL:
      process.env.TESTNET_AUTOPEER_URL ?? 'https://autopeer.rafiki.money',
    ILP_ADDRESS: process.env.ILP_ADDRESS || `test.local-playground-${v4()}`,
    CLOUD_NINE_PUBLIC_HOST: opUrl,
    CLOUD_NINE_OPEN_PAYMENTS_URL: opUrl,
    CLOUD_NINE_WALLET_ADDRESS_URL: `${opUrl}/.well-known/pay`,
    CLOUD_NINE_AUTH_SERVER_DOMAIN: authUrl,
    CLOUD_NINE_CONNECTOR_URL: connectorUrl
  }
}

async function writeEnvs(envs) {
  await fs.writeFileSync(
    './localenv/cloud-nine-wallet/.env',
    Object.entries(envs)
      .map((entry) => entry.join('='))
      .join('\n')
  )
}

async function createTunnel(port) {
  const tunnel = await localtunnel({ port })

  console.log(`Created tunnel for port ${port}: ${tunnel.url}`)
  return tunnel.url
}

async function connect() {
  console.log('Starting the tunnels and preparing .env file...')

  checkExistingEnvFile()

  const openPaymentsUrl = await createTunnel(3000)
  const authUrl = await createTunnel(3006)
  const connectorUrl = await createTunnel(3002)

  envs = getEnvs(openPaymentsUrl, authUrl, connectorUrl)
  await writeEnvs(envs)

  console.log('Tunnels and .env file are ready!')
}

connect()

process.on('SIGINT', async function () {
  console.log('Tunnels are closing...')

  // clean the env variables as other urls will be generated at next run
  await writeEnvs({
    ILP_ADDRESS: envs.ILP_ADDRESS
  })
  process.exit()
})
