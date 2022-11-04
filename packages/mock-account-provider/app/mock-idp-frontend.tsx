import { parse as parseQueryString, ParsedUrlQuery } from 'querystring'
import { useLocation } from '@remix-run/react'
import { useEffect, useMemo, useState } from 'react'
import ConsentScreen from './routes/consent-screen'

const StepNames = {
  startInteraction: 0,
  getGrant: 1,
  chooseConsent: 2,
  endInteraction: 3
}

interface ApiResponse {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  readonly payload?: any
  readonly isFailure: boolean
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  readonly contextUpdates?: { [key: string]: any }
}

class ApiSteps {
  /*
   * flow overview:
   *    1. start interaction --> GET /interact/:id/:nonce
   *    2. get grant --> GET /grant/:id/:nonce
   *    3. user makes choice --> POST /grant/:id/:nonce/accept or /grant/:id/:nonce/reject
   *    4. end interaction --> GET /interact/:id/:nonce/finish
   */

  public static BaseUrl = '/mock-idp/auth-proxy?hostname=localhost&port=3006'

  public static async startInteraction(
    params: Record<string, string>
  ): Promise<ApiResponse> {
    // start interaction --> GET /interact/:id/:nonce
    const { interactId, nonce } = params
    const response = await ApiSteps.apiCall(
      'GET',
      `/interact/${interactId}/${nonce}`
    )
    if (response.ok) {
      return {
        isFailure: false,
        payload: {
          interactionUrl: response.responseText
        }
      }
    } else {
      return {
        payload: {
          error: `status ${response.status}: ${response.responseText}`
        },
        isFailure: true
      }
    }
  }

  public static async getGrant(
    params: Record<string, string>
  ): Promise<ApiResponse> {
    // get grant --> GET /grant/:id/:nonce
    const { interactId, nonce } = params
    const response = await ApiSteps.apiCall(
      'GET',
      `/grant/${interactId}/${nonce}`,
      undefined,
      {
        'x-idp-secret': 'replace-me'
      }
    )
    if (response.ok) {
      const grant = JSON.parse(response.responseText)
      return {
        isFailure: false,
        payload: {
          grant
        },
        contextUpdates: {
          grant
        }
      }
    } else {
      return {
        payload: {
          error: `status ${response.status}: ${response.responseText}`
        },
        isFailure: true
      }
    }
  }

  public static async chooseConsent(
    params: Record<string, string>
  ): Promise<ApiResponse> {
    // make choice --> POST /grant/:id/:nonce/accept or /grant/:id/:nonce/reject
    const { interactId, nonce, acceptanceDecision } = params
    const acceptanceSubPath =
      acceptanceDecision === 'true' ? 'accept' : 'reject'
    const response = await ApiSteps.apiCall(
      'POST',
      `/grant/${interactId}/${nonce}/${acceptanceSubPath}`,
      undefined,
      {
        'x-idp-secret': 'replace-me'
      }
    )
    if (response.ok) {
      return {
        isFailure: false
      }
    } else {
      return {
        payload: {
          error: `status ${response.status}: ${response.responseText}`
        },
        isFailure: true
      }
    }
  }

  public static async endInteraction(
    params: Record<string, string>
  ): Promise<ApiResponse> {
    // end interaction --> GET /interact/:id/:nonce/finish
    const { interactId, nonce } = params
    const response = await ApiSteps.apiCall(
      'GET',
      `/interact/${interactId}/${nonce}/finish`,
      undefined,
      {
        'x-idp-secret': 'replace-me'
      }
    )
    if (response.ok) {
      return {
        isFailure: false
      }
    } else {
      return {
        payload: {
          error: `status ${response.status}: ${response.responseText}`
        },
        isFailure: true
      }
    }
  }

  private static apiCall(
    apiMethod: 'GET' | 'POST',
    apiPath: string,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    payload?: any,
    headers?: { [headerName: string]: string }
  ): Promise<{
    readonly responseText: string
    readonly status: number
    readonly ok: boolean
  }> {
    return new Promise((resolve, reject) => {
      try {
        const fullUrl =
          ApiSteps.BaseUrl +
          `&method=${apiMethod}&target=${encodeURIComponent(
            apiPath.replace(/^\//, '')
          )}`
        const xhr = new XMLHttpRequest()
        xhr.open('GET', fullUrl)
        xhr.setRequestHeader('signature', 'signature')
        xhr.setRequestHeader('signature-input', 'signature-input')
        if (headers) {
          Object.keys(headers).forEach((h) => {
            xhr.setRequestHeader(h, headers[h])
          })
        }
        xhr.onreadystatechange = function (ev) {
          if (this.readyState === 4) {
            resolve({
              responseText: this.responseText,
              status: this.status,
              ok: this.status >= 200 && this.status <= 399
            })
          }
        }
        xhr.send(payload === undefined ? undefined : JSON.stringify(payload))
      } catch (exc) {
        reject(exc)
      }
    })
  }
}

type StepStatus = 'pending' | 'succeeded' | 'failed' | 'not-started'

function OutputArea({
  title,
  serializableValue
}: {
  title: string
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  serializableValue: any
}) {
  const prettyContent =
    serializableValue === null
      ? '(null)'
      : serializableValue === undefined
      ? '(no body)'
      : Array.isArray(serializableValue) ||
        typeof serializableValue === 'object'
      ? JSON.stringify(serializableValue, null, 2)
      : `${serializableValue}`
  return (
    <div>
      <div>{title}</div>
      <pre
        style={{
          backgroundColor: 'gainsboro',
          padding: '0.5em',
          borderRadius: 5
        }}
      >
        {prettyContent}
      </pre>
    </div>
  )
}

function StepStatusBullet({ stepStatus }: { stepStatus: StepStatus }) {
  return stepStatus === 'failed' ? (
    <>&#10060;</> // cross
  ) : stepStatus === 'succeeded' ? (
    <>&#10004;</> // checkmark
  ) : (
    <>&nbsp;&nbsp;&nbsp;</>
  )
}

function StepStatusRow({
  stepIndex,
  currentStep,
  stepTexts,
  stepStatuses
}: {
  stepIndex: number
  currentStep: number
  stepTexts: Array<string>
  stepStatuses: Array<StepStatus>
}) {
  const isActiveStep = currentStep === stepIndex
  return (
    <div style={{ fontWeight: isActiveStep ? 'bold' : 'normal' }}>
      <StepStatusBullet stepStatus={stepStatuses[stepIndex]}></StepStatusBullet>
      <>&nbsp;</>
      {stepTexts[stepIndex]}
      <>&nbsp;</>
      {isActiveStep ? <>&larr;</> : <></>}
    </div>
  )
}

function DeveloperView() {
  const [ctx, setCtx] = useState({
    currentStep: 0,
    stepStatuses: [
      'pending',
      'not-started',
      'not-started',
      'not-started'
    ] as Array<StepStatus>,
    stepTexts: [
      'Start interaction',
      'Get grant',
      'Consent choice',
      'End interaction'
    ],
    isBusy: false,
    grant: null,
    previousStepResponse: null,
    previousStepFailed: false,
    endFlow: false,
    interactId: 'example-interact-id',
    nonce: 'example-interact-nonce',
    acceptanceDecision: true
  })

  const disableButton = useMemo(() => {
    return ctx.isBusy || ctx.endFlow
  }, [ctx.isBusy, ctx.endFlow])

  const advanceStep = () => {
    const stepIndex = ctx.currentStep
    let statuses = ctx.stepStatuses
    statuses[stepIndex] = 'pending'
    const nextStep = stepIndex + 1
    setCtx({
      ...ctx,
      stepStatuses: statuses,
      isBusy: true
    })

    let apiHandler: (
      params: Record<string, string>
    ) => Promise<ApiResponse> = async (params) => {
      return {
        isFailure: false
      }
    }
    switch (stepIndex) {
      case StepNames.startInteraction:
        apiHandler = ApiSteps.startInteraction
        break
      case StepNames.getGrant:
        apiHandler = ApiSteps.getGrant
        break
      case StepNames.chooseConsent:
        apiHandler = ApiSteps.chooseConsent
        break
      case StepNames.endInteraction:
        apiHandler = ApiSteps.endInteraction
        break
    }

    statuses = ctx.stepStatuses
    let endFlow = ctx.endFlow
    if (stepIndex + 1 < statuses.length) {
      statuses[stepIndex + 1] = 'pending'
    } else {
      endFlow = true
    }

    apiHandler({
      interactId: ctx.interactId,
      nonce: ctx.nonce,
      acceptanceDecision: ctx.acceptanceDecision ? 'true' : 'false'
    })
      .then((response) => {
        statuses[stepIndex] = response.isFailure ? 'failed' : 'succeeded'
        setCtx({
          ...ctx,
          currentStep: response.isFailure ? ctx.currentStep : nextStep,
          stepStatuses: statuses,
          isBusy: false,
          endFlow: endFlow,
          previousStepResponse: response.payload,
          previousStepFailed: response.isFailure,
          ...(response.contextUpdates || {})
        })
      })
      .catch((err) => {
        statuses[stepIndex] = 'failed'
        setCtx({
          ...ctx,
          stepStatuses: statuses,
          isBusy: false,
          previousStepResponse: err,
          previousStepFailed: true
        })
      })
  }

  return (
    <>
      <div style={{ padding: '1em' }}>
        <h3>Mock identity provider tester</h3>
        <div className='card'>
          <div className='list-group'>
            <div className='list-group-item'>
              <div className='card-body'>
                <div className='row'>
                  <div className='col-6'>
                    <h5 className='card-title'>Parameters</h5>
                    <form>
                      <div className='form-group'>
                        <label
                          htmlFor='mock-idp-frontend-interactId'
                          style={{ display: 'block' }}
                        >
                          interactId
                        </label>
                        <input
                          className='form-control'
                          id='mock-idp-frontend-interactId'
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
                      <div className='form-group'>
                        <label
                          htmlFor='mock-idp-frontend-nonce'
                          style={{ display: 'block' }}
                        >
                          nonce
                        </label>
                        <input
                          className='form-control'
                          id='mock-idp-frontend-nonce'
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
                      <div className='form-group'>
                        <label style={{ display: 'block' }}>decision</label>

                        <div className='form-check form-check-inline'>
                          <input
                            className='form-check-input'
                            type='radio'
                            id='mock-idp-frontend-decision-accept'
                            name='mock-idp-frontend-decision'
                            disabled={ctx.currentStep > StepNames.chooseConsent}
                            defaultChecked={ctx.acceptanceDecision}
                            onChange={(event) => {
                              setCtx({
                                ...ctx,
                                acceptanceDecision: event.target.checked
                              })
                            }}
                          ></input>
                          <label
                            className='form-check-label'
                            htmlFor='mock-idp-frontend-decision-accept'
                          >
                            accept
                          </label>
                        </div>
                        <div className='form-check form-check-inline'>
                          <input
                            className='form-check-input'
                            type='radio'
                            id='mock-idp-frontend-decision-reject'
                            name='mock-idp-frontend-decision'
                            disabled={ctx.currentStep > StepNames.chooseConsent}
                            defaultChecked={!ctx.acceptanceDecision}
                            onChange={(event) => {
                              setCtx({
                                ...ctx,
                                acceptanceDecision: !event.target.checked
                              })
                            }}
                          ></input>
                          <label
                            className='form-check-label'
                            htmlFor='mock-idp-frontend-decision-reject'
                          >
                            reject
                          </label>
                        </div>
                      </div>
                    </form>
                  </div>
                  <div className='col-6'>
                    <h5 className='card-title'>Flow</h5>
                    <StepStatusRow
                      stepIndex={StepNames.startInteraction}
                      currentStep={ctx.currentStep}
                      stepTexts={ctx.stepTexts}
                      stepStatuses={ctx.stepStatuses}
                    ></StepStatusRow>
                    <StepStatusRow
                      stepIndex={StepNames.getGrant}
                      currentStep={ctx.currentStep}
                      stepTexts={ctx.stepTexts}
                      stepStatuses={ctx.stepStatuses}
                    ></StepStatusRow>
                    <StepStatusRow
                      stepIndex={StepNames.chooseConsent}
                      currentStep={ctx.currentStep}
                      stepTexts={ctx.stepTexts}
                      stepStatuses={ctx.stepStatuses}
                    ></StepStatusRow>
                    <StepStatusRow
                      stepIndex={StepNames.endInteraction}
                      currentStep={ctx.currentStep}
                      stepTexts={ctx.stepTexts}
                      stepStatuses={ctx.stepStatuses}
                    ></StepStatusRow>
                    <br></br>
                    <br></br>
                    <button
                      type='button'
                      className={
                        disableButton ? 'btn btn-secondary' : 'btn btn-primary'
                      }
                      disabled={disableButton}
                      onClick={() => advanceStep()}
                    >
                      {ctx.isBusy ? 'awaiting response...' : 'Begin step'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className='list-group-item'>
              <div className='card-body'>
                <h5 className='card-title'>Outputs</h5>
                <div className='row'>
                  <div className='col-6'>
                    <OutputArea
                      title='latest API response'
                      serializableValue={
                        ctx.isBusy
                          ? '(XHR in progress. Please wait...)'
                          : ctx.currentStep > 0
                          ? ctx.previousStepResponse
                          : '--'
                      }
                    ></OutputArea>
                  </div>
                  <div className='col-6'>
                    <OutputArea
                      title='grant'
                      serializableValue={ctx.grant}
                    ></OutputArea>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function DemoResultView({ accepted, accesses }: { accepted: boolean, accesses: Array<any/*Access TODO*/> }) {
  return (
    <div className='list-group-item'>
      <div className='card-body'>
        <div className='row'>
          {accepted
            ? (
              <div className='col-12'>
                <h2 className='display-6'>Request accepted</h2>
                <OutputArea serializableValue={accesses} title='grant' />
              </div>)
            : (
              <div className='col-6'>
                <h2 className='display-6'>Request rejected</h2>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}

function DemoInitialView({
  interactId,
  nonce,
  setInteractId,
  setNonce,
  begin
}: {
  interactId: string
  nonce: string
  setInteractId: (interactId: string) => void
  setNonce: (nonce: string) => void
  begin: () => Promise<void> }) {
  return (
    <>
      <div className='row'>
        <div className='col-6'>
          <form>
            <div className='form-group mt-2'>
              <label
                htmlFor='mock-idp-frontend-interactId'
                style={{ display: 'block' }}
              >
                interactId
              </label>
              <input
                className='form-control'
                id='mock-idp-frontend-interactId'
                type='text'
                spellCheck={false}
                value={interactId}
                onChange={(event) => {
                  setInteractId(event.target.value)
                }}
              ></input>
            </div>
            <div className='form-group mt-2'>
              <label
                htmlFor='mock-idp-frontend-nonce'
                style={{ display: 'block' }}
              >
                nonce
              </label>
              <input
                className='form-control'
                id='mock-idp-frontend-nonce'
                type='text'
                spellCheck={false}
                value={nonce}
                onChange={(event) => {
                  setNonce(event.target.value)
                }}
              ></input>
            </div>
          </form>
        </div>
      </div>
      <div className='row mt-3'>
        <div className='col-6'>
          <button
            type='button'
            className='btn btn-primary'
            onClick={() => begin()}
          >
            Begin
          </button>
        </div>
      </div>
    </>
  )
}

function DemoView({ href, queryParams }: { href: string, queryParams: ParsedUrlQuery }) {
  const [ctx, setCtx] = useState({
    currentStep: queryParams['step'] ? Number(queryParams['step']) : StepNames.startInteraction,
    previousStepResponse: null as (Error | null),
    previousStepFailed: false,
    accesses: [],
    interactId: 'example-interact-id',
    nonce: 'example-interact-nonce',
    interactionUrl: '',
    acceptanceDecision: queryParams['decision'] ? queryParams['decision'] === 'accept' : false
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (queryParams['step']) {
        const savedData = JSON.parse(window.localStorage.getItem('mock-idp-data') || '{}')
        setCtx({
          ...ctx,
          ...savedData
        })
      } else {
        window.localStorage.removeItem('mock-idp-data')
      }
    }
  }, [])

  const begin = async () => {
    let { interactId, nonce, interactionUrl, accesses } = ctx
    const apiParams = {
      interactId: interactId,
      nonce: nonce
    }

    // start interaction

    let result = await ApiSteps.startInteraction(apiParams)
    if (result.isFailure || !result.payload) {
      return
    } else {
      interactionUrl = result.payload.interactionUrl
    }
    
    // get grant
    result = await ApiSteps.getGrant(apiParams)
    if (result.isFailure || !result.payload) {
      return
    } else {
      accesses = result.payload.grant.access
    }
    
    // redirect to consent screen
    const returnUrl = new URL(window.location.href)
    returnUrl.searchParams.set('step', `${StepNames.endInteraction}`)

    const consentScreenUrl = new URL(window.location.origin + '/consent-screen')

    consentScreenUrl.searchParams.append('returnUrl', returnUrl.toString())
    consentScreenUrl.searchParams.append('requestorName', '<RequestorName>')//TODO!!!

    accesses.forEach((access: any) => {
      consentScreenUrl.searchParams.append('access', JSON.stringify(access))
    })

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('mock-idp-data', JSON.stringify({ interactId, nonce, interactionUrl, accesses }))
    }
    window.location.href = consentScreenUrl.toString()
  }

  const reset = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('mock-idp-data')
    }
    window.location.href = '/'
  }

  return (
    <>
      <div style={{ padding: '1em' }}>
        <h3>Mock identity provider</h3>
        <div className='row'>
          <div className='col-12'>
            {ctx.currentStep === StepNames.endInteraction
              ? (<DemoResultView accepted={ctx.acceptanceDecision} accesses={ctx.accesses} />)
              : (<DemoInitialView interactId={ctx.interactId} nonce={ctx.nonce} setInteractId={(interactId) => {
                setCtx({
                  ...ctx,
                  interactId: interactId
                })
              }} setNonce={(nonce) => {
                setCtx({
                  ...ctx,
                  nonce: nonce
                })
              }} begin={begin} />)}
          </div>
        </div>
        <div className='row mt-4'>
          <div className='col-12'>
            <button
              type='button'
              className='btn btn-outline-secondary'
              onClick={() => reset()}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function MockIdpFrontend() {
  const location = useLocation()
  const href = `${location.pathname}${location.search}`
  const queryParams = parseQueryString(location.search.replace(/^\?/, ''))

  if (queryParams['view'] && queryParams['view'] === 'dev') {
    return <DeveloperView />
  } else {
    // return <DemoView href={href} queryParams={queryParams} />
    return <ConsentScreen />
  }
}
