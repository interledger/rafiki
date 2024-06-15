const variables = {
  kratosContainerPublicUrl: process.env.KRATOS_CONTAINER_PUBLIC_URL,
  kratosBrowserPublicUrl: process.env.KRATOS_BROWSER_PUBLIC_URL
}

Object.entries(variables).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Environment variable ${key} is missing`)
  }
})

export default variables
