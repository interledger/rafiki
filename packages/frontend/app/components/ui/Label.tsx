import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type LabelProps = Omit<ComponentPropsWithoutRef<'label'>, 'children'> & {
  children: ReactNode
  required?: boolean
}

export const Label = ({
  htmlFor,
  children,
  required,
  ...props
}: LabelProps) => {
  return (
    <label htmlFor={htmlFor} className='block font-medium text-sm' {...props}>
      <span>{children}</span>{' '}
      {required ? <span className='text-red-500'>*</span> : ''}
    </label>
  )
}
