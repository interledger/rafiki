const variables = {
  hydraClientName: process.env.HYDRA_CLIENT_NAME,
  hydraClientRedirectUri: process.env.HYDRA_CLIENT_REDIRECT_URI,
  hydraClientAdminUrl: process.env.HYDRA_ADMIN_URL,
  hydraPublicUrl: process.env.HYDRA_PUBLIC_URL,
  hydraPublicPort: process.env.HYDRA_PUBLIC_PORT,
  kratosContainerPublicUrl: process.env.KRATOS_CONTAINER_PULIC_URL,
  kratosBrowserPublicUrl: process.env.KRATOS_BROWSER_PUBLIC_URL
}

Object.entries(variables).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Environment variable ${key} is missing`)
  }
})

export default variables
