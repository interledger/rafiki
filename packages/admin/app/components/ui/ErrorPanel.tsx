import { XCircle } from '../icons'

type ErrorPanelProps = {
  errors?: string[]
}

export default function ErrorPanel({ errors }: ErrorPanelProps) {
  if (!errors) return null
  if (errors.length === 0) return null

  let errorMessage = 'There was an error with your submission!'
  if (errors?.length && errors.length > 1) {
    errorMessage = `There were ${errors?.length} errors with your submission`
  }

  return (
    <div className='rounded-md bg-red-100 p-4 shadow-md'>
      <div className='flex'>
        <div className='flex-shrink-0'>
          <XCircle className='h-8 w-w text-vermillion' />
        </div>
        <div className='ml-3 mt-1 text-vermillion'>
          <h3 className='font-medium'>{errorMessage}</h3>
          <div className='mt-2 text-sm'>
            <ul className='list-disc space-y-1 pl-5'>
              {errors?.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
