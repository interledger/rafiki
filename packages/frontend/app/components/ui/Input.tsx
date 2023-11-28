import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import { FieldError } from './FieldError'
import { Label } from './Label'
import { cx } from 'class-variance-authority'

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'className'> & {
  label?: string
  error?: string | string[]
  addOn?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ addOn, label, type, error, id, ...props }, ref) => {
    const internalId = id ?? useId()

    return (
      <div>
        {label && (
          <Label htmlFor={internalId} required={props.required ?? false}>
            {label}
          </Label>
        )}
        <div className='shadow-sm flex relative rounded-md'>
          {addOn ? (
            <span className='inline-flex shrink-0 items-center rounded-l-md border border-r-0 border-tealish/50 px-3 bg-mercury text-xs lg:text-base'>
              {addOn}
            </span>
          ) : null}
          <input
            id={internalId}
            ref={ref}
            type={type ?? 'text'}
            className={cx(
              'block w-full rounded-md border border-tealish/50 transition-colors duration-150 placeholder:font-extralight focus:border-tealish focus:outline-none focus:ring-0 disabled:bg-mercury',
              addOn ? 'rounded-l-none' : ''
            )}
            {...props}
          />
        </div>
        <FieldError error={error} />
      </div>
    )
  }
)

Input.displayName = 'Input'
