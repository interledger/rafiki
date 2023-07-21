type BadgeProps = {
  status: 'ACTIVE' | 'INACTIVE' | undefined | null
}

export const Badge = ({ status }: BadgeProps) => {
  const spanClassNames =
    status === 'ACTIVE'
      ? 'bg-green-200 text-green-600'
      : 'bg-red-200 text-red-200'

  const svgClassNames = status === 'ACTIVE' ? 'fill-green-400' : 'fill-red-400'

  if (!status) return 'No status'

  return (
    <span
      className={`${spanClassNames} inline-flex items-center gap-x-1.5 rounded-full  px-2 py-1 text-xs font-medium `}
    >
      <svg
        className={`h-1.5 w-1.5 ${svgClassNames}`}
        viewBox='0 0 6 6'
        aria-hidden='true'
      >
        <circle cx={3} cy={3} r={3} />
      </svg>
      {status}
    </span>
  )
}
