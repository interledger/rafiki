import { Text } from '@radix-ui/themes'

export const renderFieldError = (error?: string | string[]) => {
  if (!error) return null

  const message = Array.isArray(error) ? error.join('; ') : error

  return (
    <Text size='2' weight='medium' className='text-vermillion'>
      {message}
    </Text>
  )
}
