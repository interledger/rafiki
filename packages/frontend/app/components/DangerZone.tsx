import { type ReactNode } from 'react'

type DangerZoneProps = {
  title: string
  children: ReactNode
}

export const DangerZone = ({ title, children }: DangerZoneProps) => {
  return (
    <div className='flex flex-col items-start md:flex-row md:items-center justify-between p-4 border border-red-500 rounded-md my-4'>
      {children}
      <div className='mt-4 md:mt-0 md:ml-4'>
        <p className='text-red-400 font-medium'>
          Please note that this action is not reversible. Continue with caution.
        </p>
      </div>
    </div>
  )
}
