import { parseBool } from '~/shared/utils'

const variables = {
  authEnabled: process.env.AUTH_ENABLED
    ? parseBool(process.env.AUTH_ENABLED)
    : true,
  kratosContainerPublicUrl: process.env.KRATOS_CONTAINER_PUBLIC_URL,
  kratosBrowserPublicUrl: process.env.KRATOS_BROWSER_PUBLIC_URL,
  kratosAdminUrl: process.env.KRATOS_ADMIN_URL
}

if (variables.authEnabled) {
  Object.entries(variables).forEach(([key, value]) => {
    if (!value) {
      throw new Error(`Environment variable ${key} is missing`)
    }
  })
}

export default variables
