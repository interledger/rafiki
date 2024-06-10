import { cva, cx, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { ButtonOrLink, type ButtonOrLinkProps } from './ButtonOrLink'

const buttonStyles = cva(
  'inline-flex items-center justify-center focus:outline-none disabled:cursor-not-allowed rounded-md font-medium',
  {
    variants: {
      intent: {
        default:
          'bg-main_blue hover:bg-secondary_blue disabled:bg-mercury disabled:text-gray-500 shadow-md text-white',
        danger:
          'disabled:bg-red-200 bg-red-500 hover:bg-red-600 shadow-md text-white'
      },
      size: {
        sm: 'px-2 py-1',
        md: 'px-3 py-2'
      }
    },
    defaultVariants: {
      intent: 'default',
      size: 'md'
    }
  }
)

type ButtonProps = VariantProps<typeof buttonStyles> &
  ButtonOrLinkProps & {
    ['aria-label']: string
  }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ intent, children, className, ...props }, ref) => {
    return (
      <ButtonOrLink
        ref={ref}
        className={cx(buttonStyles({ intent }), className)}
        {...props}
      >
        {children}
      </ButtonOrLink>
    )
  }
)

Button.displayName = 'Button'
