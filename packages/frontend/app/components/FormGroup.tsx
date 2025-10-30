import type { ReactNode } from 'react'

type FormGroupProps = {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  className?: string
}

export const FormGroup = ({
  title,
  subtitle,
  children,
  className = ''
}: FormGroupProps) => {
  return (
    <div
      className={`grid grid-cols-1 py-3 gap-6 md:grid-cols-3 border-b border-pearl ${className}`}
    >
      <div className='col-span-1 pt-3'>
        <h3 className='text-lg font-medium'>{title}</h3>
        {subtitle && <div className='text-sm'>{subtitle}</div>}
      </div>
      <div className='md:col-span-2 bg-white rounded-md shadow-md'>
        {children}
      </div>
    </div>
  )
}
