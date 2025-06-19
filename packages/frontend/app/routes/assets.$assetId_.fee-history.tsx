import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { paginationSchema } from '~/lib/validate.server'
import { getAssetWithFees } from '~/lib/api/asset.server'
import { useLoaderData, useNavigate } from '@remix-run/react'
import { PageHeader } from '~/components'
import { Button, Table } from '~/components/ui'
import { checkAuthAndRedirect } from '../lib/kratos_checks.server'

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const cookies = request.headers.get('cookie')
  await checkAuthAndRedirect(request.url, cookies)

  const assetId = params.assetId
  if (!assetId) {
    throw json(null, { status: 404, statusText: 'Asset not found.' })
  }
  const url = new URL(request.url)
  const pagination = paginationSchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  )

  if (!pagination.success) {
    throw json(null, { status: 400, statusText: 'Invalid pagination.' })
  }

  const asset = await getAssetWithFees(request, {
    ...pagination.data,
    id: assetId
  })

  if (!asset) {
    throw json(null, { status: 404, statusText: 'Asset not found.' })
  }

  let previousPageUrl = '',
    nextPageUrl = ''

  if (asset.fees?.pageInfo.hasPreviousPage) {
    previousPageUrl = `/assets/${assetId}/fee-history?before=${asset.fees.pageInfo.startCursor}`
  }

  if (asset.fees?.pageInfo.hasNextPage) {
    nextPageUrl = `/assets/${assetId}/fee-history?after=${asset.fees.pageInfo.endCursor}`
  }

  return json({ assetId, fees: asset.fees, previousPageUrl, nextPageUrl })
}

export default function AssetFeesPage() {
  const { assetId, fees, previousPageUrl, nextPageUrl } =
    useLoaderData<typeof loader>()
  const navigate = useNavigate()

  return (
    <div className='pt-4 flex flex-col space-y-8'>
      <div className='flex flex-col rounded-md bg-offwhite px-6'>
        <PageHeader>
          <div className='flex-1'>
            <h3 className='text-2xl'>Asset Fees</h3>
          </div>
          <div className='ml-auto'>
            <Button
              aria-label='back to asset overview'
              onClick={() => {
                navigate(`/assets/${assetId}`)
              }}
            >
              Back to asset
            </Button>
          </div>
        </PageHeader>
        <Table>
          <Table.Head
            columns={['ID', 'Type', 'Fixed', 'Basis points', 'Creation date']}
          />
          <Table.Body>
            {fees?.edges.length ? (
              fees.edges.map((fee) => (
                <Table.Row key={fee.node.id}>
                  <Table.Cell>{fee.node.id}</Table.Cell>
                  <Table.Cell>{fee.node.type}</Table.Cell>
                  <Table.Cell>{fee.node.fixed}</Table.Cell>
                  <Table.Cell>{fee.node.basisPoints}</Table.Cell>
                  <Table.Cell>
                    {new Date(fee.node.createdAt).toLocaleString()}
                  </Table.Cell>
                </Table.Row>
              ))
            ) : (
              <Table.Row>
                <Table.Cell colSpan={5} className='text-center'>
                  No fees found.
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <div className='flex items-center justify-between p-5'>
          <Button
            aria-label='go to previous page'
            disabled={!fees?.pageInfo.hasPreviousPage}
            onClick={() => {
              navigate(previousPageUrl)
            }}
          >
            Previous
          </Button>
          <Button
            aria-label='go to next page'
            disabled={!fees?.pageInfo.hasNextPage}
            onClick={() => {
              navigate(nextPageUrl)
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
