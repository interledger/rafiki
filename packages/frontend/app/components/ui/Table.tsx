import { cx } from 'class-variance-authority'
import { type ComponentProps, type ReactNode } from 'react'

type TableProps = ComponentProps<'table'> & {
  children: ReactNode
}

type THeadProps = ComponentProps<'thead'> & {
  columns: string[]
  thProps?: ComponentProps<'th'>
  trProps?: ComponentProps<'tr'>
}

type TBodyProps = ComponentProps<'tbody'> & {
  children: ReactNode
}

type TRowProps = ComponentProps<'tr'> & {
  children: ReactNode
}

type TCellProps = ComponentProps<'td'> & {
  children: ReactNode
}

const THead = ({
  columns,
  thProps,
  trProps,
  className,
  ...props
}: THeadProps) => {
  return (
    <thead className={cx(className, 'font-bold')} {...props}>
      <tr {...trProps}>
        {columns.map((col) => (
          <th key={col} className='p-3 text-left' {...thProps}>
            {col}
          </th>
        ))}
      </tr>
    </thead>
  )
}

const TBody = ({ children, ...props }: TBodyProps) => {
  return <tbody {...props}>{children}</tbody>
}

const TRow = ({ children, className, ...props }: TRowProps) => {
  return (
    <tr
      className={cx(
        className,
        'odd:bg-mercury/20 even:bg-mercury/50 hover:bg-mercury'
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

const TCell = ({ children, className, ...props }: TCellProps) => {
  return (
    <td
      className={cx(
        className,
        'overflow-hidden whitespace-nowrap text-ellipsis p-2 md:p-4'
      )}
      {...props}
    >
      {children}
    </td>
  )
}

export const Table = ({ children, className, ...props }: TableProps) => {
  return (
    <div className='overflow-x-auto'>
      <table
        className={cx(
          className,
          'min-w-full divide-y divide-mercury table-fixed'
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  )
}

Table.Head = THead
Table.Body = TBody
Table.Row = TRow
Table.Cell = TCell
