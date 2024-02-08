import { CONFIG, type Config } from '../parse_config.server'
import axios, { AxiosError } from 'axios'

interface HydraClientData {
  grant_types: string[];
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  response_types: string[];
  scope: string;
  client_secret: string;
  skip_consent: boolean;
  token_endpoint_auth_method: string;
}

async function createHydraClient(
  id: string,
  name: string,
  redirectUri: string
) {
  const clientData: HydraClientData = {
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

  try {
    const existingClientResponse = await axios.get(
      `http://hydra:4445/admin/clients/${id}`
    )
    if (existingClientResponse.data) {
      console.log(`Hydra client already exists: ${id}`)
      return
    }
  } catch (error) {
    const axiosError = error as AxiosError
    if (axiosError.response && axiosError.response.status === 404) {
      try {
        await axios.post(
          'http://hydra:4445/admin/clients',
          clientData
        )
      } catch(postError) {
        throw new Error(`Error creating Hydra client: ${postError}`)
      }
    }
    throw new Error(`Error creating Hydra client: ${axiosError}`)
  }
}

export async function setupFromSeed(config: Config): Promise<void> {
  for (const { id, name, redirectUri } of config.clients) {
    await createHydraClient(id, name, redirectUri)
  }
}

export async function runSeed(): Promise<void> {
  return setupFromSeed(CONFIG)
}
