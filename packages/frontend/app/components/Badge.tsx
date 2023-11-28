import { cx } from 'class-variance-authority'
import type { WalletAddressStatus } from '~/generated/graphql'

type BadgeProps = {
  status: WalletAddressStatus
}

export const Badge = ({ status }: BadgeProps) => {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-medium',
        status === 'ACTIVE'
          ? 'bg-green-200 text-green-800'
          : 'bg-red-200 text-red-800'
      )}
    >
      {status}
    </span>
  )
}
