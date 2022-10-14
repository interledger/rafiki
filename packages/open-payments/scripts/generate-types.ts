import fs from 'fs'
import openapiTS from 'openapi-typescript'
import config from '../src/config'
;(async () => {
  try {
    const output = await openapiTS(config.OPEN_PAYMENTS_OPEN_API_URL)
    const fileName = 'src/generated/types.ts'

    fs.writeFile(fileName, output, (error) => {
      if (error) {
        console.log(`Error when writing types to ${fileName}`, { error })
      }
    })
  } catch (error) {
    console.log('Error when generating types', {
      error
    })
  }
})()
