import { Popover, Transition } from '@headlessui/react'
import { Fragment } from 'react'

type PopoverFilterOption = {
  name: string
  value: string
  action: () => void
}

type PopoverFilterProps = {
  label: string
  values?: string[]
  options: PopoverFilterOption[]
}

export const PopoverFilter = ({
  label,
  options,
  values
}: PopoverFilterProps) => {
  return (
    <Popover className='relative'>
      <Popover.Button className='inline-flex w-[400px] items-center justify-between gap-2 rounded-md border border-pearl bg-white px-3 py-2 text-sm text-tealish shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F37F64]'>
        {label}
      </Popover.Button>
      <Transition
        as={Fragment}
        leave='transition ease-in duration-100'
        leaveFrom='opacity-100'
        leaveTo='opacity-0'
      >
        <Popover.Panel className='absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'>
          <div className='space-y-2 p-2'>
            {options.map((option) => (
              <div key={option.value} className='flex items-center'>
                <input
                  type='checkbox'
                  id={option.value}
                  className='w-5 h-5 rounded border-gray-300 text-[#F37F64] focus:ring-[#F37F64]'
                  checked={values ? values.includes(option.value) : false}
                  onChange={option.action}
                />
                <label
                  htmlFor={option.value}
                  className='ml-3 min-w-0 flex-1 text-gray-900'
                >
                  {option.name}
                </label>
              </div>
            ))}
          </div>
        </Popover.Panel>
      </Transition>
    </Popover>
  )
}
