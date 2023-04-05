import { forwardRef, useId, type ComponentPropsWithoutRef } from 'react'
import { FieldError } from './FieldError'
import { Label } from './Label'

type SelectProps = Omit<ComponentPropsWithoutRef<'select'>, 'className'> & {
  label?: string
  error?: string | string[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, children, ...props }, ref) => {
    const id = useId()

    return (
      <div>
        {label && (
          <Label htmlFor={id} required={props.required ?? false}>
            {label}
          </Label>
        )}
        <select
          id={id}
          ref={ref}
          className='block w-full rounded-md border border-tealish/50 transition-colors pr-10 duration-150 placeholder:font-extralight focus:border-tealish focus:outline-none focus:ring-0 disabled:bg-mercury'
          {...props}
        >
          {children}
        </select>
        <FieldError error={error} />
      </div>
    )
  }
)

Select.displayName = 'Select'
