export interface FieldErrorProps {
  error?: string | string[]
}

export const FieldError = ({ error }: FieldErrorProps) => {
  if (!error) return null

  return (
    <div className='text-vermillion font-medium'>
      {Array.isArray(error) ? (
        <>
          {error.map((e) => (
            <p key={e}>e</p>
          ))}
        </>
      ) : (
        error
      )}
    </div>
  )
}
