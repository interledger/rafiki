import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { forwardRef, useId, useState } from 'react'
import { Text, TextField } from '@radix-ui/themes'
import { Eye, EyeSlash } from '../icons'
import { FieldError } from './FieldError'
import { Label } from './Label'

type InputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'className' | 'type' | 'size' | 'color' | 'defaultValue' | 'value'
> & {
  label?: string
  error?: string | string[]
  description?: ReactNode
  defaultValue?: string | number
  value?: string | number
}

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, description, ...props }, ref) => {
    const id = useId()
    const [isVisible, setIsVisible] = useState(false)

    return (
      <div>
        {label && (
          <Label htmlFor={id} required={props.required ?? false}>
            {label}
          </Label>
        )}
        <TextField.Root
          id={id}
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          size='3'
          className='w-full'
          {...props}
        >
          <TextField.Slot side='right'>
            <button
              type='button'
              onClick={() => setIsVisible(!isVisible)}
              className='flex items-center'
            >
              {isVisible ? (
                <EyeSlash className='h-5 w-5' />
              ) : (
                <Eye className='h-5 w-5' />
              )}
            </button>
          </TextField.Slot>
        </TextField.Root>
        {description ? (
          <Text size='2' color='gray'>
            {description}
          </Text>
        ) : null}
        <FieldError error={error} />
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
