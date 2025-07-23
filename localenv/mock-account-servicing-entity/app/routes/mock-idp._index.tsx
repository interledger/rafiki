import {
  json,
  useLoaderData,
  useLocation,
  useOutletContext
} from '@remix-run/react'
import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '~/components'
import { ApiClient } from '~/lib/apiClient'
import type { Access, InstanceConfig } from '~/lib/types'
import { CONFIG } from '~/lib/parse_config.server'

interface ConsentScreenContext {
  ready: boolean
  thirdPartyName: string
  thirdPartyUri: string
  interactId: string
  nonce: string
  returnUrl: string
  accesses: Array<Access> | null
  outgoingPaymentAccess: Access | null
  price: GrantAmount | null
  costToUser: GrantAmount | null
  errors: Array<Error>
}

interface GrantAmount {
  amount: number
  currencyDisplayCode: string
}

export enum AmountType {
  DEBIT = 'debit',
  RECEIVE = 'receive',
  UNLIMITED = 'unlimited'
}

export function loader() {
  return json({
    defaultIdpSecret: CONFIG.idpSecret,
    isTenant: process.env.IS_TENANT === 'true'
  })
}

function ConsentScreenBody({
  _thirdPartyUri,
  thirdPartyName,
  price,
  costToUser,
  interactId,
  nonce,
  returnUrl
}: {
  _thirdPartyUri: string
  thirdPartyName: string
  price: GrantAmount | null
  costToUser: GrantAmount | null
  interactId: string
  nonce: string
  returnUrl: string
}) {
  const chooseConsent = (accept: boolean) => {
    const href = new URL(returnUrl)
    href.searchParams.append('interactId', interactId)
    href.searchParams.append('nonce', nonce)
    href.searchParams.append('decision', accept ? 'accept' : 'reject')
    window.location.href = href.toString()
  }

  return (
    <>
      <div className='bg-white rounded-md p-8 px-16'>
        <div className='col-12'>
          {price && (
            <p>
              {thirdPartyName} wants to send {price.currencyDisplayCode}{' '}
              {price.amount.toFixed(2)} to its account.
            </p>
          )}
        </div>
        <div className='row mt-2'>
          <div className='col-12'>
            {costToUser && (
              <p>
                This will cost you {costToUser.currencyDisplayCode}{' '}
                {costToUser.amount.toFixed(2)}
              </p>
            )}
          </div>
        </div>
        <div className='row mt-2'>
          <div className='col-12'>
            {!price && !costToUser && (
              <p>
                {thirdPartyName} is requesting grant for an unlimited amount
              </p>
            )}
          </div>
        </div>
        <div className='row mt-2'>
          <div className='col-12'>Do you consent?</div>
        </div>
        <div className='row mt-2'>
          <div className='flex flex-row w-6/12 justify-around m-auto mt-8 mb-0 px-4'>
            <Button aria-label='allow' onClick={() => chooseConsent(true)}>
              Yes
            </Button>
            <Button aria-label='deny' onClick={() => chooseConsent(false)}>
              No
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function PreConsentScreen({
  ctx,
  setCtx
}: {
  ctx: ConsentScreenContext
  setCtx: Dispatch<SetStateAction<ConsentScreenContext>>
}) {
  return (
    <>
      <div className='row mt-2'>
        <div className='col-12 text-start'>
          <h5 className='display-6'>Mock Identity Provider</h5>
        </div>
      </div>
      <div className='row'>
        <div className='col-12 text-start'>
          <form>
            <div className='form-group mt-3'>
              <label
                htmlFor='pre-consent-screen-interactId'
                style={{ display: 'block' }}
              >
                interactId
              </label>
              <input
                className='form-control'
                id='pre-consent-screen-interactId'
                type='text'
                spellCheck={false}
                value={ctx.interactId}
                onChange={(event) => {
                  setCtx({
                    ...ctx,
                    interactId: event.target.value
                  })
                }}
              ></input>
            </div>
            <div className='form-group mt-3'>
              <label
                htmlFor='pre-consent-screen-nonce'
                style={{ display: 'block' }}
              >
                nonce
              </label>
              <input
                className='form-control'
                id='pre-consent-screen-nonce'
                type='text'
                spellCheck={false}
                value={ctx.nonce}
                onChange={(event) => {
                  setCtx({
                    ...ctx,
                    nonce: event.target.value
                  })
                }}
              ></input>
            </div>
            <div className='form-group mt-3'>
              <label
                htmlFor='pre-consent-screen-return-url'
                style={{ display: 'block' }}
              >
                return url
              </label>
              <input
                className='form-control'
                id='pre-consent-screen-return-url'
                type='text'
                spellCheck={false}
                value={ctx.returnUrl}
                onChange={(event) => {
                  setCtx({
                    ...ctx,
                    returnUrl: event.target.value
                  })
                }}
              ></input>
            </div>
          </form>
        </div>
      </div>
      <div className='row mt-2'>
        <div className='col-12 text-start'>
          <button
            className='btn btn-primary'
            disabled={!ctx.interactId || !ctx.nonce || !ctx.returnUrl}
            onClick={() => {
              setCtx({
                ...ctx,
                ready: true
              })
            }}
          >
            Begin
          </button>
        </div>
      </div>
    </>
  )
}

type ConsentScreenProps = {
  idpSecretParam: string
}

// In production, ensure that secrets are handled securely and are not exposed to the client-side code.
export default function ConsentScreen({ idpSecretParam }: ConsentScreenProps) {
  const { defaultIdpSecret, isTenant } = useLoaderData<typeof loader>()
  const [ctx, setCtx] = useState({
    ready: false,
    thirdPartyName: '',
    thirdPartyUri: '',
    interactId: 'demo-interact-id',
    nonce: 'demo-interact-nonce',
    returnUrl: `http://localhost:${isTenant ? 5030 : 3030}/mock-idp/consent?`,
    //TODO returnUrl: 'http://localhost:3030/mock-idp/consent?interactid=demo-interact-id&nonce=demo-interact-nonce',
    accesses: null,
    outgoingPaymentAccess: null,
    price: null,
    costToUser: null,
    errors: new Array<Error>()
  } as ConsentScreenContext)
  const location = useLocation()
  const queryParams = new URLSearchParams(location.search)
  const instanceConfig: InstanceConfig = useOutletContext()

  const idpSecret = idpSecretParam ? idpSecretParam : defaultIdpSecret

  useEffect(() => {
    if (
      ctx.errors.length === 0 &&
      !ctx.ready &&
      queryParams.has('interactId') &&
      queryParams.has('nonce')
    ) {
      const interactId = queryParams.get('interactId')
      const nonce = queryParams.get('nonce')
      const returnUrl = queryParams.get('returnUrl')
      const clientName = queryParams.get('clientName')
      const clientUri = queryParams.get('clientUri')
      if (interactId && nonce) {
        setCtx({
          ...ctx,
          ready: true,
          interactId,
          nonce,
          returnUrl: returnUrl || ctx.returnUrl,
          thirdPartyName: clientName || '',
          thirdPartyUri: clientUri || ''
        })
      }
    }
  }, [ctx, setCtx, queryParams])

  useEffect(() => {
    if (ctx.errors.length === 0 && ctx.ready && !ctx.accesses) {
      const { interactId, nonce } = ctx

      ApiClient.getGrant(
        {
          interactId,
          nonce
        },
        idpSecret
      )
        .then((response) => {
          if (response.isFailure) {
            setCtx({
              ...ctx,
              errors: response.errors.map((e) => new Error(e))
            })
          } else if (!response.payload) {
            setCtx({
              ...ctx,
              errors: [new Error('no accesses in grant')]
            })
          } else {
            const outgoingPaymentAccess =
              response.payload.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (p: Record<string, any>) => p.type === 'outgoing-payment'
              ) || null
            const returnUrlObject = new URL(ctx.returnUrl)
            returnUrlObject.searchParams.append(
              'grantId',
              outgoingPaymentAccess.grantId
            )
            returnUrlObject.searchParams.append(
              'thirdPartyName',
              ctx.thirdPartyName
            )
            returnUrlObject.searchParams.append(
              'thirdPartyUri',
              ctx.thirdPartyUri
            )
            returnUrlObject.searchParams.append(
              'currencyDisplayCode',
              outgoingPaymentAccess?.limits?.debitAmount?.assetCode ??
                outgoingPaymentAccess?.limits?.receiveAmount?.assetCode ??
                null
            )
            returnUrlObject.searchParams.append(
              'amountValue',
              outgoingPaymentAccess?.limits?.debitAmount?.value ??
                outgoingPaymentAccess?.limits?.receiveAmount?.value ??
                null
            )
            returnUrlObject.searchParams.append(
              'amountScale',
              outgoingPaymentAccess?.limits?.debitAmount?.assetScale ??
                outgoingPaymentAccess?.limits?.receiveAmount?.assetScale ??
                null
            )
            returnUrlObject.searchParams.append(
              'amountType',
              outgoingPaymentAccess?.limits?.receiveAmount
                ? AmountType.RECEIVE
                : outgoingPaymentAccess?.limits?.debitAmount
                  ? AmountType.DEBIT
                  : AmountType.UNLIMITED
            )
            setCtx({
              ...ctx,
              accesses: response.payload,
              outgoingPaymentAccess: outgoingPaymentAccess,
              thirdPartyName: ctx.thirdPartyName,
              thirdPartyUri: ctx.thirdPartyUri,
              returnUrl: returnUrlObject.toString()
            })
          }
        })
        .catch((err) => {
          setCtx({
            ...ctx,
            errors: [err]
          })
        })
    }
  }, [ctx, setCtx])

  useEffect(() => {
    if (
      ctx.errors.length === 0 &&
      ctx.ready &&
      ctx.outgoingPaymentAccess &&
      !ctx.price &&
      !ctx.costToUser
    ) {
      if (ctx.outgoingPaymentAccess.limits) {
        if (
          ctx.outgoingPaymentAccess.limits.debitAmount &&
          ctx.outgoingPaymentAccess.limits.receiveAmount
        ) {
          setCtx({
            ...ctx,
            errors: [
              new Error('only one of receiveAmount or debitAmount allowed')
            ]
          })
        } else {
          const { receiveAmount, debitAmount } =
            ctx.outgoingPaymentAccess.limits
          setCtx({
            ...ctx,
            ...(receiveAmount && {
              price: {
                amount:
                  Number(receiveAmount.value) /
                  Math.pow(10, receiveAmount.assetScale),
                currencyDisplayCode: receiveAmount.assetCode
              }
            }),
            ...(debitAmount && {
              costToUser: {
                amount:
                  Number(debitAmount.value) /
                  Math.pow(10, debitAmount.assetScale),
                currencyDisplayCode: debitAmount.assetCode
              }
            })
          })
        }
      }
    }
  }, [ctx, setCtx])

  return (
    <>
      <div className='row flex flex-col items-center md:pt-16'>
        <div className='flex items-center flex-shrink-0 space-x-2 mb-12'>
          <img className='w-8' src={`/${instanceConfig?.logo}`} alt='Logo' />
          <p className='px-3 py-2 text-lg font-medium'>
            {instanceConfig?.name}
          </p>
        </div>
        {ctx.ready ? (
          <>
            {ctx.errors.length > 0 ? (
              <>
                <h2 className='display-6'>Failed</h2>
                <ul>
                  {ctx.errors.map((e, ei) => (
                    <li className='text-danger' key={ei}>
                      {e.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ConsentScreenBody
                _thirdPartyUri={ctx.thirdPartyUri}
                thirdPartyName={ctx.thirdPartyName}
                price={ctx.price}
                costToUser={ctx.costToUser}
                interactId={ctx.interactId}
                nonce={ctx.nonce}
                returnUrl={ctx.returnUrl}
              />
            )}
          </>
        ) : (
          <PreConsentScreen ctx={ctx} setCtx={setCtx} />
        )}
      </div>
    </>
  )
}
