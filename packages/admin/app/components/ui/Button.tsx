import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ButtonOrLink, type ButtonOrLinkProps } from './utils/ButtonOrLink'

const buttonStyles = cva(
  'inline-flex items-center justify-center focus:outline-none disabled:cursor-not-allowed',
  {
    variants: {
      intent: {
        default:
          'bg-[#F37F64] hover:bg-[#DA725A] disabled:bg-mercury disabled:text-gray-500 shadow-md text-white'
      },
      size: {
        sm: 'px-2 py-1 rounded-md font-medium',
        md: 'px-3 py-2 rounded-md font-medium'
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
  ({ intent, children, ...props }, ref) => {
    return (
      <ButtonOrLink ref={ref} className={buttonStyles({ intent })} {...props}>
        {children}
      </ButtonOrLink>
    )
  }
)

Button.displayName = 'Button'
