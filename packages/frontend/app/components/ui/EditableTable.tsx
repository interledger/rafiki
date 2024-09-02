import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Input } from './Input'
import { Table } from './Table'
import { FieldError } from './FieldError'
import { Button } from './Button'

type EditableTableProps = {
  name: string
  label: string
  options: EditableTableOption[]
  error?: string | string[]
  description?: ReactNode
  valueFormatter?: (values: string[]) => string
  required?: boolean
}

type EditableTableOption = {
  label: string
  value: string
  canDelete?: boolean
  canEdit?: boolean
  showInput?: boolean
}

export const EditableTable = ({
  name,
  label,
  options,
  error,
  description = undefined,
  valueFormatter = (values) => values.join(','),
  required = false
}: EditableTableProps) => {
  const [optionsList, setOptionsList] = useState<EditableTableOption[]>(options)
  const [value, setValue] = useState<string>('')

  const toggleEditInput = (index: number) => {
    setOptionsList(
      optionsList.map((option, i) => {
        if (i === index) {
          return {
            ...option,
            showInput: true
          }
        }
        return option
      })
    )
  }

  const editOption = (index: number, value: string) => {
    if (!value) {
      deleteOption(index)
      return
    }
    setOptionsList(
      optionsList.map((option, i) => {
        if (i === index) {
          return {
            ...option,
            showInput: false,
            value
          }
        }
        return option
      })
    )
  }

  const deleteOption = (index: number) => {
    setOptionsList(optionsList.filter((_, i) => i !== index))
  }

  const addOption = () => {
    setOptionsList([
      ...optionsList,
      { label: '', value: '', canDelete: true, canEdit: true, showInput: true }
    ])
  }

  useEffect(() => {
    setValue(getValue())
  }, [optionsList])

  const getValue = () => {
    return valueFormatter(optionsList.map((option) => option.value))
  }

  return (
    <>
      <Input
        type='hidden'
        name={name}
        value={value}
        required={required}
        label={label}
      />
      <Table>
        <Table.Head columns={['Token', 'Action']} />
        <Table.Body>
          {(optionsList || []).map((option, index) => (
            <Table.Row key={index}>
              <Table.Cell key={0}>
                {option.showInput ? (
                  <Input
                    type='text'
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(),
                      editOption(index, e.currentTarget.value))
                    }
                    defaultValue={option.value}
                    required={required}
                  />
                ) : (
                  <span>{option.value}</span>
                )}
              </Table.Cell>
              <Table.Cell key={1}>
                {option.canEdit && !option.showInput ? (
                  <Button
                    aria-label='edit'
                    onClick={() => toggleEditInput(index)}
                  >
                    Edit
                  </Button>
                ) : null}
                {option.canDelete ? (
                  <Button
                    className='ml-2'
                    aria-label='delete'
                    onClick={() => deleteOption(index)}
                  >
                    Delete
                  </Button>
                ) : null}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className='flex justify-end mt-2'>
        <Button aria-label='add' onClick={() => addOption()}>
          Add
        </Button>
      </div>
      {description ? (
        <div className='font-medium text-sm'>{description}</div>
      ) : null}
      <FieldError error={error} />
    </>
  )
}
