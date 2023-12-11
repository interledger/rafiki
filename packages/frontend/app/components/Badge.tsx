import { cx } from 'class-variance-authority'

export enum BadgeColor {
  Green = 'bg-green-200 text-green-800',
  Red = 'bg-red-200 text-red-800',
  Yellow = 'bg-yellow-200 text-yellow-800',
  Gray = 'bg-gray-200 text-gray-800'
}

type BadgeProps = {
  children: React.ReactNode
  color: BadgeColor
}

export const Badge = ({ children, color }: BadgeProps) => {
  color = color || BadgeColor.Gray
  return (
    <span
      className={cx(
        'inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-medium',
        color
      )}
    >
      {children}
    </span>
  )
}
