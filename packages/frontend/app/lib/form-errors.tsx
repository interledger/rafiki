import { Box, Flex, Text } from '@radix-ui/themes'
import { XCircle } from '~/components/icons'

export const renderFieldError = (error?: string | string[]) => {
  if (!error) return null

  const message = Array.isArray(error) ? error.join('; ') : error

  return (
    <Text size='2' weight='medium' className='text-vermillion'>
      {message}
    </Text>
  )
}

export const renderErrorPanel = (errors?: string[]) => {
  if (!errors?.length) return null

  const errorMessage =
    errors.length > 1
      ? `There were ${errors.length} errors with your submission`
      : 'There was an error with your submission!'

  return (
    <Box className='rounded-md border border-red-200 bg-red-50 p-4'>
      <Flex gap='3' align='start'>
        <XCircle className='h-6 w-6 text-vermillion' />
        <div>
          <Text size='2' weight='medium' className='text-vermillion'>
            {errorMessage}
          </Text>
          <ul className='mt-2 list-disc space-y-1 pl-5 text-sm text-vermillion'>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      </Flex>
    </Box>
  )
}
