import {
  useLoaderData,
  useLocation,
  json,
  useOutletContext
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { ApiClient } from '~/lib/apiClient'
import { CONFIG as config } from '~/lib/parse_config.server'
import { Button } from '~/components'
import { CheckCircleSolid, XCircle } from '~/components/icons'
import { InstanceConfig } from '~/lib/types'
import { AmountType } from './mock-idp._index'

export function loader() {
  return json({
    authServerDomain: config.authServerDomain,
    idpSecret: config.idpSecret // In production, ensure that secrets are handled securely and are not exposed to the client-side code.
  })
}

function AuthorizedView({
  thirdPartyName,
  currencyDisplayCode,
  amount,
  interactId,
  nonce,
  authServerDomain,
  amountType
}: {
  thirdPartyName: string
  currencyDisplayCode: string
  amount: number
  interactId: string
  nonce: string
  authServerDomain: string
  amountType: string
}) {
  let message = `You gave ${thirdPartyName} permission to `
  switch (amountType) {
    case AmountType.RECEIVE:
      message += `receive ${currencyDisplayCode} ${amount.toFixed(2)} in your account.`
      break
    case AmountType.DEBIT:
      message += `send ${currencyDisplayCode} ${amount.toFixed(2)} out of your account.`
      break
    case AmountType.UNLIMITED:
      message += 'have unlimited access to your account.'
      break
    default:
      message = 'Type of authorization is missing'
  }
  return (
    <div className='bg-white rounded-md p-8 px-16'>
      <div className='row mt-2 flex flex-row items-center justify-around'>
        <div>
          <CheckCircleSolid className='w-16 h-16 text-green-400 flex-shrink-0 mr-6' />
        </div>
        <div>
          <p>{message}</p>
        </div>
      </div>
      <div className='row mt-2'>
        <div className='flex flex-row w-6/12 justify-around m-auto mt-8 mb-0 px-4'>
          <Button
            aria-label='close'
            onClick={() => {
              ApiClient.endInteraction(interactId, nonce, authServerDomain)
            }}
          >
            OK
          </Button>
        </div>
      </div>
    </div>
  )
}

function RejectedView({
  thirdPartyName,
  interactId,
  nonce,
  authServerDomain
}: {
  thirdPartyName: string
  interactId: string
  nonce: string
  authServerDomain: string
}) {
  return (
    <div className='bg-white rounded-md p-8 px-16'>
      <div className='row mt-2 flex flex-row items-center justify-around'>
        <div>
          <XCircle className='w-16 h-16 text-red-400 flex-shrink-0 mr-6' />
        </div>
        <div>
          <p>You denied {thirdPartyName} access to your account.</p>
        </div>
      </div>
      <div className='row mt-2'>
        <div className='flex flex-row w-6/12 justify-around m-auto mt-8 mb-0 px-4'>
          <Button
            aria-label='close'
            onClick={() => {
              ApiClient.endInteraction(interactId, nonce, authServerDomain)
            }}
          >
            OK
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Consent() {
  const { idpSecret, authServerDomain } = useLoaderData<typeof loader>()
  const location = useLocation()
  const instanceConfig: InstanceConfig = useOutletContext()
  const queryParams = new URLSearchParams(location.search)
  const [ctx, setCtx] = useState({
    done: false,
    authorized: false,
    interactId: '',
    nonce: '',
    grantId: queryParams.get('grantId'),
    thirdPartyName: queryParams.get('thirdPartyName'),
    thirdPartyUri: queryParams.get('thirdPartyUri'),
    currencyDisplayCode: queryParams.get('currencyDisplayCode'),
    amount:
      Number(queryParams.get('amountValue')) /
      Math.pow(10, Number(queryParams.get('amountScale'))),
    amountType: queryParams.get('amountType')
  })

  useEffect(() => {
    if (!ctx.done) {
      const interactId = queryParams.get('interactId')
      const nonce = queryParams.get('nonce')
      const decision = queryParams.get('decision')

      if (interactId && nonce) {
        const acceptanceDecision =
          !!decision && decision.toLowerCase() === 'accept'
        ApiClient.chooseConsent(
          interactId,
          nonce,
          acceptanceDecision,
          idpSecret
        )
          .then((_consentResponse) => {
            setCtx({
              ...ctx,
              done: true,
              authorized: acceptanceDecision,
              interactId,
              nonce
            })
          })
          .catch((_err) => {
            setCtx({
              ...ctx,
              done: true,
              interactId,
              nonce
            })
          })
      }
    }
  }, [ctx, queryParams])

  return (
    <div className='row flex flex-col items-center md:mt-16'>
      <div className='flex items-center flex-shrink-0 space-x-2 mb-12'>
        <img className='w-8' src={`/${instanceConfig?.logo}`} alt='Logo' />
        <p className='px-3 py-2 text-lg font-medium'>{instanceConfig?.name}</p>
      </div>
      {ctx.authorized ? (
        <AuthorizedView
          thirdPartyName={ctx.thirdPartyName || ''}
          currencyDisplayCode={ctx.currencyDisplayCode || ''}
          amount={ctx.amount}
          interactId={ctx.interactId}
          nonce={ctx.nonce}
          authServerDomain={authServerDomain}
          amountType={ctx.amountType || ''}
        />
      ) : (
        <RejectedView
          thirdPartyName={ctx.thirdPartyName || ''}
          interactId={ctx.interactId}
          nonce={ctx.nonce}
          authServerDomain={authServerDomain}
        />
      )}
      {/* <div className='row mt-3'>
            <div className='col-12'>
              <div className='row'>
                <div className='col-12'>Grant ID: {ctx.grantId}</div>
              </div>
            </div>
          </div> */}
    </div>
  )
}
