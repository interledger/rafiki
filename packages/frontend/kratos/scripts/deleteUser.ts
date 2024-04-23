import axios from 'axios'
import process from 'process'
import { logger } from '../../app/utils/logger.server'

// Use process.argv to accept an email argument from the command line
const USER_EMAIL = process.argv[2]
if (!USER_EMAIL) {
  logger.error('No email argument provided.')
  process.exit(1)
}

const KRATOS_INSTANCE = process.env.KRATOS_ADMIN_URL
if (!KRATOS_INSTANCE) {
  logger.error('No Kratos instance found.')
  process.exit(1)
}

const getIdentityId = async () => {
  try {
    const response = await axios.get(
      `${KRATOS_INSTANCE}/identities?credentials_identifier=${USER_EMAIL}`
    )
    if (response.data.length > 0 && response.data[0].id) {
      logger.debug(
        `User with email ${USER_EMAIL} exists on the system with the ID: ${response.data[0].id}`
      )
      return response.data[0].id
    }
    logger.info(`No user with email ${USER_EMAIL} exists on the system`)
    return null
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(
        `Error retrieving identity for ${USER_EMAIL}:`,
        error.response?.status,
        error.response?.data
      )
    } else {
      logger.error(
        `An unexpected error occurred while trying to retrieve the identity for ${USER_EMAIL}:`,
        error
      )
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
      logger.info(
        `Successfully deleted user ${USER_EMAIL} with ID ${identityId}`
      )
    return
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(
        `Error deleting identity for ${USER_EMAIL}:`,
        error.response?.status,
        error.response?.data
      )
    } else {
      logger.error(
        `An unexpected error occurred while trying to delete an account for ${USER_EMAIL}:`,
        error
      )
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
