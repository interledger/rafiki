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
    <Popover className='relative mt-2'>
      <Popover.Button className='relative w-[400px] cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6'>
        {label}
      </Popover.Button>
      <Transition
        as={Fragment}
        leave='transition ease-in duration-100'
        leaveFrom='opacity-100'
        leaveTo='opacity-0'
      >
        <Popover.Panel className='absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'>
          <div>
            {options.map((option) => (
              <div key={option.value} className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  id={option.value}
                  className='relative cursor-default select-none py-2 pl-3 pr-9'
                  checked={values ? values.includes(option.value) : false}
                  onChange={option.action}
                />
                <label
                  htmlFor={`checkbox-${option.value}`}
                  className='ml-2 block truncate text-sm text-gray-900'
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
