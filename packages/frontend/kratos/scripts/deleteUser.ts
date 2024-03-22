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

const getIdentityId = async () => {
  try {
    const response = await axios.get(
      `${KRATOS_INSTANCE}/identities?credentials_identifier=${USER_EMAIL}`
    )
    if (response.data.length > 0 && response.data[0].id) {
      console.log(
        'User with email ',
        USER_EMAIL,
        'exists on the system with the ID: ',
        response.data[0].id
      )
      return response.data[0].id
    }
    console.log('No user with email ', USER_EMAIL, 'exists on the system')
    return null
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        'Error retrieving identity:',
        error.response?.status,
        error.response?.data
      )
    } else {
      console.error('An unexpected error occurred:', error)
    }
    process.exit(1)
  }
}

const deleteIdentity = async (identityId: string) => {
  try {
    const response = await axios.delete(
      `${KRATOS_INSTANCE}/identities/${identityId}`
    )
    if (response.status === 204)
      console.log('Successfully deleted user with ID ', identityId)
    return
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

const run = async () => {
  const identityId = await getIdentityId()
  if (identityId !== null) {
    await deleteIdentity(identityId)
  }
}

run()
