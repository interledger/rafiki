import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-gray-100 text-gray-800',
        primary:
          'bg-primary/10 text-primary',
        secondary:
          'bg-secondary text-secondary-foreground',
        destructive:
          'bg-red-100 text-red-800',
        success:
          'bg-green-100 text-green-800',
        warning:
          'bg-yellow-100 text-yellow-800',
        outline: 'border border-gray-300 text-gray-700'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
