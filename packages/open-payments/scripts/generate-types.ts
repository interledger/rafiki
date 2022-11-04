import fs from 'fs'
import openapiTS from 'openapi-typescript'
import config from '../src/config'

const generateTypesFromOpenApi = async (
  specUrl: string,
  outputFileName: string
) => {
  const generatedTypesOutput = await openapiTS(specUrl)

  fs.writeFile(outputFileName, generatedTypesOutput, (error) => {
    if (error) {
      console.log(`Error when writing types to ${outputFileName}`, { error })
    }
  })
}

;(async () => {
  const rootFolder = `src/generated`

  try {
    await generateTypesFromOpenApi(
      config.OPEN_PAYMENTS_RS_OPEN_API_URL,
      `${rootFolder}/resource-server-types.ts`
    )
    await generateTypesFromOpenApi(
      config.OPEN_PAYMENTS_AS_OPEN_API_URL,
      `${rootFolder}/authorization-server-types.ts`
    )
  } catch (error) {
    console.log('Error when generating types', {
      error
    })
  }
})()
