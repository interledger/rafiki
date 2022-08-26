import { useState } from 'react'

/*
 * 1. start interaction --> GET /interact/:id
 * 2. get grant --> GET /grant
 * 3. user makes choice --> POST /grant/accept or /grant/reject
 *    | --> mock UI as part of this component
 * 4. end interaction --> GET /interact/finish
**/

const StepNames = {
  startInteraction: 0,
  getGrant: 1,
  chooseConsent: 2,
  endInteraction: 3
}

interface ApiResponse {
  readonly payload?: any
  readonly isFailure: boolean
}

class ApiSteps {
  public static async startInteraction(): Promise<ApiResponse> {
    // TODO: start interaction --> GET /interact/:id/:nonce
    return {
      payload: {
        error: 'NOT IMPLEMENTED YET'
      },
      isFailure: true
    }
  }

  public static async getGrant(): Promise<ApiResponse> {
    // TODO: get grant --> GET /grant/:id/:nonce
    return {
      payload: {
        error: 'NOT IMPLEMENTED YET'
      },
      isFailure: true
    }
  }

  public static async chooseConsent(): Promise<ApiResponse> {
    // TODO: make choice --> POST /grant/accept or /grant/reject
    return {
      payload: {
        error: 'NOT IMPLEMENTED YET'
      },
      isFailure: true
    }
  }
  
  public static async endInteraction(): Promise<ApiResponse> {
    // TODO: end interaction --> GET /interact/finish
    return {
      payload: {
        error: 'NOT IMPLEMENTED YET'
      },
      isFailure: true
    }
  }
}

type StepStatus = 'pending' | 'succeeded' | 'failed' | 'not-started'

function OutputArea({ title, serializableValue }: { title: string, serializableValue: any }) {
  const prettyContent = serializableValue === null
    ? '(null)'
    : serializableValue === undefined
    ? '(undefined)'
    : Array.isArray(serializableValue) || typeof serializableValue === 'object'
    ? JSON.stringify(serializableValue, null, 2)
    : `${serializableValue}`
  return (
    <div>
      <div>{title}</div>
      <pre style={{ backgroundColor: 'gainsboro', padding: '0.5em', borderRadius: 5 }}>{prettyContent}</pre>
    </div>
  )
}

function StepStatusBullet({ stepStatus }: { stepStatus: StepStatus }) {
  return (
    stepStatus === 'not-started'
    ? <>&nbsp;&nbsp;&nbsp;</>
    : stepStatus === 'failed'
    ? <>&#10060;</> // cross
    : stepStatus === 'succeeded'
    ? <>&#10004;</> // checkmark
    : <>&rarr;</>)
}

function StepStatusRow({ stepIndex, currentStep, stepTexts, stepStatuses }: { stepIndex: number, currentStep: number, stepTexts: Array<string>, stepStatuses: Array<StepStatus> }) {
  return (
    <div style={{ fontWeight: currentStep === stepIndex ? 'bold' : 'normal'}}>
        <StepStatusBullet stepStatus={stepStatuses[stepIndex]}></StepStatusBullet>
        <>&nbsp;</>
        {stepTexts[stepIndex]}
      </div>
  )
}

export default function ConsentScreen() {
  const [ctx, setCtx] = useState({
    currentStep: 0,
    stepStatuses: ['pending', 'not-started', 'not-started', 'not-started'] as Array<StepStatus>,
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
    endFlow: false
  })

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

    let apiHandler: () => Promise<ApiResponse> = async () => {
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
    statuses[stepIndex] = 'succeeded'
    let endFlow = ctx.endFlow
    if (stepIndex + 1 < statuses.length) {
      statuses[stepIndex + 1] = 'pending'
    } else {
      endFlow = true
    }

    apiHandler()
      .then((response) => {
        setCtx({
          ...ctx,
          currentStep: nextStep,
          stepStatuses: statuses,
          isBusy: false,
          endFlow: endFlow,
          previousStepResponse: response.payload,
          previousStepFailed: response.isFailure
        })
      })
      .catch((err) => {
        setCtx({
          ...ctx,
          currentStep: nextStep,
          stepStatuses: statuses,
          isBusy: false,
          previousStepResponse: err,
          previousStepFailed: true
        })
      })
  }
  
  return (
    <div>
      <h2>Consent screen mock and tester</h2>
      <StepStatusRow stepIndex={StepNames.startInteraction} currentStep={ctx.currentStep} stepTexts={ctx.stepTexts} stepStatuses={ctx.stepStatuses}></StepStatusRow>
      <StepStatusRow stepIndex={StepNames.getGrant} currentStep={ctx.currentStep} stepTexts={ctx.stepTexts} stepStatuses={ctx.stepStatuses}></StepStatusRow>
      <StepStatusRow stepIndex={StepNames.chooseConsent} currentStep={ctx.currentStep} stepTexts={ctx.stepTexts} stepStatuses={ctx.stepStatuses}></StepStatusRow>
      <StepStatusRow stepIndex={StepNames.endInteraction} currentStep={ctx.currentStep} stepTexts={ctx.stepTexts} stepStatuses={ctx.stepStatuses}></StepStatusRow>
      <br></br>
      <button className='btn btn-success' disabled={ctx.isBusy || ctx.endFlow} onClick={() => advanceStep()}>{ ctx.isBusy ? 'awaiting response...' : 'Begin step' }</button>
      <hr></hr>
      <OutputArea title='grant' serializableValue={ctx.grant}></OutputArea>
      <OutputArea title='latest API response' serializableValue={ctx.isBusy ? '(XHR in progress. Please wait...)' : ctx.currentStep > 0 ? ctx.previousStepResponse : ''}></OutputArea>
    </div>
  )
}
