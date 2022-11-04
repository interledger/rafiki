import { useLocation } from '@remix-run/react'
import { useEffect, useState } from 'react'
import { ApiClient } from '~/lib/apiClient'
import { parseQueryString } from '~/lib/utils'

function AuthorizedView({ thirdPartyName, currencyDisplayCode, amount }
  : { thirdPartyName: string, currencyDisplayCode: string, amount: number }) {
  return (<>
    <div className='row'>
      <div className='col-12'>
        <i className='bi bi-check-circle-fill text-success display-1'></i>
      </div>
    </div>
    <div className='row mt-2'>
      <div className='col-12'>
        <p>
          You gave {thirdPartyName} permission to send {currencyDisplayCode} {amount.toFixed(2)} out of your account.
        </p>
      </div>
    </div>
  </>)
}

function RejectedView({ thirdPartyName }
  : { thirdPartyName: string }) {
  return (<>
    <div className='row'>
      <div className='col-12'>
        <i className='bi bi-x-circle-fill text-danger display-1'></i>
      </div>
    </div>
    <div className='row mt-2'>
      <div className='col-12'>
        <p>
          You denied {thirdPartyName} access to your account.
        </p>
      </div>
    </div>
  </>)
}

export default function ShoeShop() {
  const location = useLocation()
  const queryParams = parseQueryString(location.search)
  const [ctx, setCtx] = useState({
    done: false,
    authorized: false,
    interactId: '',
    nonce: '',
    grantId: '',
    interactionRef: '',
    thirdPartyName: '',
    currencyDisplayCode: '',
    amount: 0
  })

  useEffect(() => {
    if (!ctx.done) {
      const interactId = queryParams.getAsString('interactId')
      const nonce = queryParams.getAsString('nonce')
      const decision = queryParams.getAsString('decision')

      if (interactId && nonce) {
        const acceptanceDecision = !!decision && decision.toLowerCase() === 'accept'
        ApiClient.chooseConsent(interactId, nonce, acceptanceDecision).then((consentResponse) => {
          ApiClient.endInteraction(interactId, nonce)
            .then((finishResponse) => {
              let updated = false
              if (!consentResponse.isFailure && consentResponse.payload && !finishResponse.isFailure && finishResponse.payload) {
                const outgoingPaymentAccess = consentResponse.payload.find(p => p.type === 'outgoing-payment')
                if (outgoingPaymentAccess && outgoingPaymentAccess.limits && outgoingPaymentAccess.limits.sendAmount) {
                  updated = true
                  setCtx({
                    ...ctx,
                    done: true,
                    authorized: acceptanceDecision,
                    interactId,
                    nonce,
                    grantId: outgoingPaymentAccess.grantId,
                    interactionRef: finishResponse.payload.interact_ref,
                    thirdPartyName: outgoingPaymentAccess.limits.receiver,
                    currencyDisplayCode: outgoingPaymentAccess.limits.sendAmount.assetCode,
                    amount: Number(outgoingPaymentAccess.limits.sendAmount.value) / outgoingPaymentAccess.limits.sendAmount.assetScale
                  })
                }

                if (!updated) {
                  setCtx({
                    ...ctx,
                    done: true,
                    interactId,
                    nonce
                  })
                }
              } else {
                setCtx({
                  ...ctx,
                  done: true,
                  interactId,
                  nonce
                })
              }
            })
            .catch((err) => {
              setCtx({
                ...ctx,
                done: true,
                interactId,
                nonce
              })
            })
        }).catch((err) => {
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
    <>
      <div style={{
        background: 'linear-gradient(0deg, rgba(9,9,121,0.8) 0%, rgba(193,1,250,0.8) 50%, rgba(9,9,121,0.8) 100%)',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: -1,
        width: '100%',
        height: '100%',
        opacity: '0.25',
        filter: 'sepia(0.75) invert(1)'
      }}>&nbsp;</div>
      <div className='card text-center mx-auto mt-3 w-50 p-3 justify-center'>
        <div className='card-body d-grid gap-3'>
          <div className='row mt-1'>
            <div className='col-12'>
              <div className='row'>
                <div className='col-12'>
                  <img src='wallet-shoeshop-icon.png' style={{ scale: '0.7' }}></img>
                </div>
              </div>
              {ctx.authorized
                ? (<AuthorizedView thirdPartyName={ctx.thirdPartyName} currencyDisplayCode={ctx.currencyDisplayCode} amount={ctx.amount} />)
                : (<RejectedView thirdPartyName={ctx.thirdPartyName} />)
              }
            </div>
          </div>
          <div className='row mt-3'>
            <div className='col-12'>
              <div className='row'>
                <div className='col-12'>
                  Grant ID: {ctx.grantId}
                </div>
              </div>
              <div className='row'>
                <div className='col-12'>
                  Interaction Reference: {ctx.interactionRef}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
