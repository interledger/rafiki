import { Listbox, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { Check } from './icons'
import { Label } from './ui'

type DropdownFilterOption = {
  name: string
  value: string
  action: () => void
}

type DropdownFilterProps = {
  label: string
  values?: string[]
  options: DropdownFilterOption[]
}

export const DropdownFilter = ({
  label,
  options,
  values
}: DropdownFilterProps) => {
  return (
    <Listbox value={values ?? ['all']} onChange={() => void 0} multiple>
      {({ open }) => (
        <>
          <Listbox.Label as={Label}>{label}</Listbox.Label>
          <div className='relative mt-2'>
            <Listbox.Button className='relative w-[400px] cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6'>
              <span className='block truncate'>All</span>
              <span className='pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2'></span>
            </Listbox.Button>

            <Transition
              show={open}
              as={Fragment}
              leave='transition ease-in duration-100'
              leaveFrom='opacity-100'
              leaveTo='opacity-0'
            >
              <Listbox.Options className='absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'>
                {options.map((option) => (
                  <Listbox.Option
                    key={option.value}
                    className='relative cursor-default select-none py-2 pl-3 pr-9'
                    value={option.value}
                    onClick={option.action}
                  >
                    {({ selected }) => (
                      <>
                        <span className='block truncate'>{option.name}</span>

                        {selected ? (
                          <span className='absolute inset-y-0 right-0 flex items-center pr-4'>
                            <Check className='h-5 w-5' aria-hidden='true' />
                          </span>
                        ) : null}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </div>
        </>
      )}
    </Listbox>
  )
}
