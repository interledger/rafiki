import axios from 'axios'
import variables from '../utils/envConfig.server'

const uuidv4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface HydraClientData {
  grant_types: string[]
  client_name: string
  redirect_uris: string[]
  response_types: string[]
  scope: string
  skip_consent: boolean
  token_endpoint_auth_method: string
}

export async function createHydraClient(name: string, redirectUri: string) {
  const clientData: HydraClientData = {
    grant_types: ['authorization_code'],
    client_name: name,
    redirect_uris: [redirectUri],
    response_types: ['code'],
    scope: 'full_access',
    skip_consent: true,
    token_endpoint_auth_method: 'client_secret_post'
  }

  try {
    const responseData = await axios.post(
      `${variables.hydraClientAdminUrl}/clients`,
      clientData
    )
    const clientId = responseData.data?.client_id
    if (clientId && uuidv4Pattern.test(clientId)) {
      process.env.HYDRA_CLIENT_ID = clientId
    } else {
      throw new Error(`Error extracting Hydra client ID`)
    }
    const clientSecret = responseData.data?.client_secret
    if (clientSecret) {
      process.env.HYDRA_CLIENT_SECRET = clientSecret
    } else {
      throw new Error(`Error extracting Hydra client secret`)
    }
  } catch (error) {
    throw new Error(`Error creating Hydra client: ${error}`)
  }
}

export async function setupFromSeed(): Promise<void> {
  if (!variables.hydraClientName || !variables.hydraClientRedirectUri) {
    throw new Error(
      'Hydra client cannot be created without a name and redirect URI'
    )
  }
  await createHydraClient(
    variables.hydraClientName,
    variables.hydraClientRedirectUri
  )
}

export async function runSeed(): Promise<void> {
  return setupFromSeed()
}
