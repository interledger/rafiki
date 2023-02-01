import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ButtonOrLink, type ButtonOrLinkProps } from './utils/ButtonOrLink'

const buttonStyles = cva(
  'inline-flex items-center justify-center px-4 py-1.5 rounded-md font-medium focus:outline-none disabled:cursor-not-allowed',
  {
    variants: {
      intent: {
        default: 'bg-pearl hover:bg-wafer disabled:bg-mercury shadow-md '
      }
    },
    defaultVariants: {
      intent: 'default'
    }
  }
)

type ButtonProps = VariantProps<typeof buttonStyles> &
  ButtonOrLinkProps & {
    ['aria-label']: string
  }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ intent, children, ...props }, ref) => {
    return (
      <ButtonOrLink ref={ref} className={buttonStyles({ intent })} {...props}>
        {children}
      </ButtonOrLink>
    )
  }
)

Button.displayName = 'Button'
