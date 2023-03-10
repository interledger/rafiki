import type { ComponentPropsWithoutRef } from 'react'
import { forwardRef, useId } from 'react'

import { FieldError } from './FieldError'
import { Label } from './Label'

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'className'> & {
  label?: string
  error?: string | string[]
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, type, error, ...props }, ref) => {
    const id = useId()

    return (
      <div>
        {label && (
          <Label htmlFor={id} required={props.required ?? false}>
            {label}
          </Label>
        )}
        <div className='shadow-sm relative'>
          <input
            id={id}
            ref={ref}
            type={type ?? 'text'}
            className='block w-full rounded-md border border-tealish/50 transition-colors duration-150 placeholder:font-extralight focus:border-tealish focus:outline-none focus:ring-0 disabled:bg-mercury'
            {...props}
          />
        </div>
        <FieldError error={error} />
      </div>
    )
  }
)

Input.displayName = 'Input'
