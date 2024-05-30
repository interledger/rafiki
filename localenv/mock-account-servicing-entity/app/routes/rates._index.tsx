import { json } from '@remix-run/node'
import { CONFIG as config } from '~/lib/parse_config.server'
import { useLoaderData } from '@remix-run/react'
import { PageHeader, Table } from '../components'

const formatCurrency = (value: number): string => {
  if (value % 1 == 0 || value.toString().split('.')[1].length < 3) {
    return String(value.toFixed(2))
  }

  return String(value)
}

export const loader = async () => {
  const rates = config.seed.rates
  const currencies = Object.keys(rates)

  return json({ currencies, rates })
}

export default function Rates() {
  const { currencies, rates } = useLoaderData<typeof loader>()

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-white px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Rates</h3>
          </div>
        </PageHeader>
        <Table>
          <Table.Head columns={[' ', ...currencies]} />
          <Table.Body>
            {currencies.length ? (
              currencies.map((curr) => (
                <Table.Row key={curr} className='cursor-pointer'>
                  <Table.Cell>1 {curr}</Table.Cell>
                  {currencies.map((rate) => (
                    <Table.Cell>
                      {rates[curr][rate]
                        ? formatCurrency(rates[curr][rate])
                        : '1.00'}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={4} className='text-center'>
                  No rates found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>&nbsp;</div>
      </div>
    </div>
  )
}
