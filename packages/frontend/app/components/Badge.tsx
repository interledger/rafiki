type BadgeProps = {
  status: 'ACTIVE' | 'INACTIVE' | undefined | null
}

export const Badge = ({ status }: BadgeProps) => {
  const spanClassNames =
    status === 'ACTIVE'
      ? 'bg-green-200 text-green-800'
      : 'bg-red-200 text-red-800'

  if (!status) return 'No status'

  return (
    <span
      className={`${spanClassNames} inline-flex items-center gap-x-1.5 rounded-full  px-2 py-1 text-xs font-medium `}
    >
      {status}
    </span>
  )
}
