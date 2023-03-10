import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

type PageHeaderProps = {
  children: ReactNode
  className?: string
}

export const PageHeader = ({ children, className }: PageHeaderProps) => {
  return (
    <div
      className={cx(
        className,
        'flex py-4 bg-offwhite rounded-md items-center justify-between space-x-5'
      )}
    >
      {children}
    </div>
  )
}
