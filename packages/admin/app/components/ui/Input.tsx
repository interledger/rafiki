import { forwardRef, useId } from 'react'
import type { ComponentPropsWithoutRef } from 'react'

import { FieldError } from './FieldError'

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'className'> & {
  label?: string
  error?: string | string[]
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, type, error, ...props }, ref) => {
    const id = useId()

    return (
      <div className=''>
        {label && (
          <label htmlFor={id} className='block font-medium'>
            {label}
          </label>
        )}
        <div className='shadow-sm'>
          <input
            id={id}
            ref={ref}
            type={type ?? 'text'}
            className='block w-full rounded-md border border-tealish/50 transition-colors duration-150 placeholder:font-extralight focus:border-tealish focus:outline-none focus:ring-0'
            {...props}
          />
        </div>
        <FieldError error={error} />
      </div>
    )
  }
)

Input.displayName = 'Input'
