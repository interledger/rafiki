// TODO: set up system to get a second link if the first expired
import axios from 'axios'
import process from 'process'

// Use process.argv to accept an email argument from the command line
const USER_EMAIL = process.argv[2]
if (!USER_EMAIL) {
  console.error('No email argument provided.')
  process.exit(1)
}

const KRATOS_INSTANCE = process.env.KRATOS_ADMIN_URL
if (!KRATOS_INSTANCE) {
  console.error('No Kratos instance found.')
  process.exit(1)
}

const createIdentity = async () => {
  try {
    const response = await axios.post(
      `${KRATOS_INSTANCE}/identities`,
      {
        schema_id: 'default',
        traits: {
          email: USER_EMAIL
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    console.log('Successfully created user with ID ', response.data.id)
    return response.data.id
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        'Error creating identity:',
        error.response?.status,
        error.response?.data
      )
    } else {
      console.error('An unexpected error occurred:', error)
    }
    process.exit(1)
  }
}

const createRecoveryLink = async (identityId: string) => {
  try {
    const response = await axios.post(
      `${KRATOS_INSTANCE}/recovery/link`,
      {
        expires_in: '12h',
        identity_id: identityId
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    return response.data.recovery_link
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        'Error creating recovery link:',
        error.response?.status,
        error.response?.data
      )
      // TODO: check if this fails because the user already exists
    } else {
      console.error('An unexpected error occurred:', error)
    }
    process.exit(1)
  }
}

const run = async () => {
  const identityId = await createIdentity()
  const recoveryLink = await createRecoveryLink(identityId)
  console.log('Recovery link:', recoveryLink)
}

run()
