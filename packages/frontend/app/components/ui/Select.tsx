import { Fragment, useId, useState } from 'react'
import { Combobox, Transition } from '@headlessui/react'
import { Input } from './Input'
import { Check, Chevron } from '../icons'
import { Label } from './Label'

export type SelectOption = {
  label: string
  value: string
}

type SelectProps = {
  options: SelectOption[]
  placeholder: string
  name?: string
  label?: string
  disabled?: boolean
  required?: boolean
}

export const Select = ({
  options,
  name,
  placeholder,
  label,
  disabled = false,
  required = false
}: SelectProps) => {
  const id = useId()
  const [internalValue, setInternalValue] = useState<SelectOption>({
    label: '',
    value: ''
  })
  const [searchTerm, setSearchTerm] = useState('')

  const filteredOptions =
    searchTerm === ''
      ? options
      : options.filter((option) =>
          option.label
            .toLowerCase()
            .replace(/\s+/g, '')
            .includes(searchTerm.toLowerCase().replace(/\s+/g, ''))
        )

  return (
    <Combobox
      name={name}
      value={internalValue}
      onChange={setInternalValue}
      disabled={disabled}
    >
      <div className='relative'>
        {label ? (
          <Combobox.Label as={Label} htmlFor={id} required={required}>
            {label}
          </Combobox.Label>
        ) : null}
        <div className='relative'>
          <Combobox.Input
            as={Input}
            id={id}
            required={required}
            displayValue={(option: SelectOption) => option.label}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={placeholder}
          />
          <Combobox.Button className='absolute inset-y-0 right-0 flex items-center pr-2'>
            {({ open }) => (
              <Chevron
                className='text-tealish w-5 h-5 transition-all duration-100'
                direction={open ? 'down' : 'left'}
                strokeWidth={3}
              />
            )}
          </Combobox.Button>
        </div>
        <Transition
          as={Fragment}
          leave='transition ease-in duration-100'
          leaveFrom='opacity-100'
          leaveTo='opacity-0'
          afterLeave={() => setSearchTerm('')}
        >
          <Combobox.Options className='absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg focus:outline-none'>
            {filteredOptions.length === 0 && searchTerm !== '' ? (
              <div className='select-none py-2 px-4 text-tealish'>
                Nothing found.
              </div>
            ) : (
              filteredOptions.map((option) => (
                <Combobox.Option
                  key={option.value}
                  className={({ active }) =>
                    `relative select-none py-2 px-4 ${active && 'bg-pearl'}`
                  }
                  value={option}
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
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </Transition>
      </div>
    </Combobox>
  )
}
