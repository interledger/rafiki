import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type LabelProps = Omit<ComponentPropsWithoutRef<'label'>, 'children'> & {
  children: ReactNode
}

export const Label = ({ htmlFor, children, ...props }: LabelProps) => {
  return (
    <label htmlFor={htmlFor} className='block font-medium text-sm' {...props}>
      {children}
    </label>
  )
}
