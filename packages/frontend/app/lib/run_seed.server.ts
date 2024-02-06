import { CONFIG, type Config, type Client } from '../parse_config.server'

import axios from 'axios'

// TODO move to appropriate location
async function createHydraClient(
  id: string,
  name: string,
  redirectUri: string
) {
  const clientData = {
    grant_types: ['authorization_code'],
    client_id: id,
    client_name: name,
    redirect_uris: [redirectUri],
    response_types: ['code'],
    scope: 'full_access',
    client_secret: 'YourClientSecret',
    skip_consent: true,
    token_endpoint_auth_method: 'client_secret_post'
  }

  // TODO: error handling
  try {
    const existingClientResponse = await axios.get(
      `http://localhost:4445/admin/clients/${id}`
    )
    if (existingClientResponse.data) {
      console.log(`Client already exists: ${id}`)
      return
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      const response = await axios.post(
        'http://localhost:4445/admin/clients',
        clientData
      )
      console.log('Hydra client created: ', response.data)
      return
    }
    throw new Error(`Error creating Hydra client: ${error}`)
  }
}

export async function setupFromSeed(config: Config): Promise<void> {
  for (const { id, name, redirectUri } of config.clients) {
    await createHydraClient(id, name, redirectUri)
  }
}

export async function runSeed(): Promise<void> {
  console.log('calling run_seed')
  return setupFromSeed(CONFIG)
}
