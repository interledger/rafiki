import { type ReactNode } from 'react'

type DangerZoneProps = {
  title: string
  children: ReactNode
}

export const DangerZone = ({ title, children }: DangerZoneProps) => {
  return (
    <div className='flex flex-col items-start md:flex-row md:items-center justify-between p-4 border border-red-500 rounded-md shadow-md my-4'>
      <div className='mb-4 md:mb-0'>
        <h2 className='text-red-500 font-semibold text-2xl'>{title}</h2>
        <p className='text-red-400 font-medium'>
          Please note that this action is not reversible. Continue with caution.
        </p>
      </div>
      {children}
    </div>
  )
}
