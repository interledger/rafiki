import { Listbox, Transition } from '@headlessui/react'
import { Fragment, useState } from 'react'
import { FieldError } from './FieldError'
import { Check, Chevron } from '../icons'
import { Label } from './Label'

export type DropdownOption = {
  label: string
  value: string
}

type DropdownProps = {
  options: DropdownOption[]
  placeholder: string
  name?: string
  label?: string
  disabled?: boolean
  required?: boolean
  error?: string | string[]
  defaultValue?: DropdownOption
}

export const Dropdown = ({
  options,
  name,
  placeholder,
  label,
  error,
  disabled = false,
  required = false,
  defaultValue = undefined
}: DropdownProps) => {
  const [internalValue, setInternalValue] = useState<
    DropdownOption | undefined
  >(defaultValue)

  return (
    <Listbox
      value={internalValue}
      onChange={setInternalValue}
      disabled={disabled}
    >
      <div className='relative'>
        {name ? (
          <input type='hidden' name={name} value={internalValue?.value ?? ''} />
        ) : null}
        <Listbox.Label as={Label} required={required}>
          {label}
        </Listbox.Label>
        <div className='relative'>
          <Listbox.Button
            role='combobox'
            aria-required
            className='relative w-full border border-tealish/50 rounded-md bg-white transition-colors duration-150 py-2 pl-3 pr-10 text-left shadow-sm focus:border-tealish focus:outline-none focus:ring-0'
          >
            {({ open }) => (
              <>
                {internalValue ? internalValue.label : placeholder}
                <div className='pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2'>
                  <Chevron
                    className='text-tealish w-5 h-5 transition-all duration-100'
                    direction={open ? 'down' : 'left'}
                    strokeWidth={3}
                  />
                </div>
              </>
            )}
          </Listbox.Button>
        </div>
        {error ? <FieldError error={error} /> : null}
        <Transition
          as={Fragment}
          leave='transition ease-in duration-100'
          leaveFrom='opacity-100'
          leaveTo='opacity-0'
        >
          <Listbox.Options className='absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg focus:outline-none'>
            {options.map((option) => (
              <Listbox.Option
                key={option.value}
                value={option}
                className={({ active }) =>
                  `relative select-none py-2 px-4 ${active && 'bg-pearl'}`
                }
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? 'font-medium' : 'font-normal'
                      }`}
                    >
                      {option.label}
                    </span>
                    {selected ? (
                      <span className='absolute inset-y-0 right-0 flex items-center pr-3'>
                        <Check className='w-6 h-6' />
                      </span>
                    ) : null}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}
