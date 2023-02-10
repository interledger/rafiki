import { cx } from 'class-variance-authority'
import type { SVGProps } from 'react'

const DIRECTION = {
  up: 'rotate-180',
  down: 'rotate-0',
  left: 'rotate-90',
  right: '-rotate-90'
} as const

type Direction = keyof typeof DIRECTION

type ChevronProps = SVGProps<SVGSVGElement> & {
  direction?: Direction
}

export const Chevron = ({
  direction = 'down',
  className,
  ...props
}: ChevronProps) => {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      fill='none'
      viewBox='0 0 24 24'
      strokeWidth={1.5}
      stroke='currentColor'
      className={cx(className, DIRECTION[direction])}
      {...props}
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        d='M19.5 8.25l-7.5 7.5-7.5-7.5'
      />
    </svg>
  )
}
