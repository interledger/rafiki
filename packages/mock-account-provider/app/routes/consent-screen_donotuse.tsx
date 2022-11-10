import { parse } from 'querystring'
import { NavigateFunction, useLocation, useNavigate } from '@remix-run/react'

type AccessAction = 'create' | 'read' | 'list' | 'complete'

type AccessType = 'account' | 'incoming-payment' | 'outgoing-payment' | 'quote'

interface PaymentAmount {
  value: string
  assetCode: string
  assetScale: number
}

interface AccessLimit {
  receiver: string
  sendAmount?: PaymentAmount
  receiveAmount?: PaymentAmount
}

interface Access {
  type: AccessType
  actions: Array<AccessAction>
  limits?: AccessLimit
}

const currencySymbols: { [assetCode: string]: string } = {
  USD: '$',
  EUR: '€'
}

function formatCurrencyAmount({
  value,
  assetScale
}: {
  value: string
  assetScale: number
}): string {
  return (Number(value) / assetScale).toFixed(2)
}

function AccessTypeOverview({
  icon,
  accessType,
  actions,
  limits
}: {
  icon: string
  accessType: AccessType
  actions: Array<AccessAction>
  limits?: AccessLimit
}) {
  const canComplete = actions.includes('complete')
  const canCreate = actions.includes('create')
  const canList = actions.includes('list')
  const canRead = actions.includes('read')
  const unitNamePlural = `${accessType.replace('-', ' ')}s`
  const limitText = limits
    ? accessType === 'outgoing-payment' && limits.sendAmount
      ? `send up to ${
          currencySymbols[limits.sendAmount.assetCode] || ''
        }${formatCurrencyAmount(limits.sendAmount)} to ${limits.receiver}`
      : accessType === 'incoming-payment' && limits.receiveAmount
      ? `receive up to ${
          currencySymbols[limits.receiveAmount.assetCode] || ''
        }${formatCurrencyAmount(limits.receiveAmount)}`
      : ''
    : ''

  return (
    <div className='card mt-2'>
      <div className='card-body'>
        <h5 className='card-title'>{unitNamePlural}</h5>
        <div className='row'>
          <div className='col-3'>
            <h1 className='display-1'>
              <i className={'bi bi-' + icon}></i>
            </h1>
          </div>
          <div className='col-9'>
            <ul>
              <li hidden={!limitText}>{limitText}</li>
              <li hidden={!canComplete}>complete {unitNamePlural}</li>
              <li hidden={!canCreate}>create {unitNamePlural}</li>
              <li hidden={!canList}>list {unitNamePlural}</li>
              <li hidden={!canRead}>read {unitNamePlural}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function AccessOverviewRow({
  accessType,
  actions,
  limits
}: {
  accessType: AccessType
  actions: Array<AccessAction>
  limits?: AccessLimit
}) {
  const icon =
    accessType === 'account'
      ? 'wallet2'
      : accessType === 'incoming-payment'
      ? 'piggy-bank'
      : accessType === 'outgoing-payment'
      ? 'cash'
      : 'tag'

  return (
    <AccessTypeOverview
      icon={icon}
      accessType={accessType}
      actions={actions}
      limits={limits}
    />
  )
}

interface ConsentScreenParams {
  errors: Array<Error>
  accesses: Array<Access>
  requestorName: string
  returnUrl: string
}

function isAccessType(accessType: string): accessType is AccessType {
  return (
    accessType === 'account' ||
    accessType === 'incoming-payment' ||
    accessType === 'outgoing-payment' ||
    accessType === 'quote'
  )
}

function parseQueryString(query: string) {
  const dictionary = parse(query)
  const pairs = Object.keys(dictionary).map((k) => {
    return [k.toLowerCase().replace(/^\?/, ''), dictionary[k]!]
  })

  return {
    get: (key: string): string | Array<string> => {
      return (pairs.find((p) => p[0] === key.toLowerCase()) || ['', ''])[1]
    },
    getAsArray: (key: string): Array<string> => {
      const value = (pairs.find((p) => p[0] === key.toLowerCase()) || [
        '',
        ''
      ])[1]
      if (Array.isArray(value)) {
        return value
      } else {
        return [value]
      }
    },
    getAsString: (key: string): string => {
      const value = (pairs.find((p) => p[0] === key.toLowerCase()) || [
        '',
        ''
      ])[1]
      if (Array.isArray(value)) {
        return value[value.length - 1]
      } else {
        return value
      }
    },
    has: (key: string) => {
      return pairs.some((p) => p[0] === key.toLowerCase())
    }
  }
}

function parseConsentScreenParams(query: string): ConsentScreenParams {
  const parsedParams: ConsentScreenParams = {
    errors: new Array<Error>(),
    accesses: [],
    requestorName: '',
    returnUrl: ''
  }

  const queryParams = parseQueryString(query)

  if (queryParams.has('access')) {
    const accessParams = queryParams.getAsArray('access')

    accessParams.forEach((ap, apIndex) => {
      const errors = new Array<Error>()
      const o = JSON.parse(ap)

      if (!o.type) {
        errors.push(
          new Error(`missing property 'type' for access param ${apIndex}`)
        )
      } else if (!isAccessType(o.type)) {
        errors.push(
          new Error(`invalid property 'type' for access param ${apIndex}`)
        )
      }

      if (!o.actions || !Array.isArray(o.actions) || o.actions.length < 1) {
        errors.push(
          new Error(
            `missing or empty property 'actions' for access param ${apIndex}`
          )
        )
      }

      if (o.limits) {
        if (!o.limits.receiver) {
          errors.push(
            new Error(
              `missing property 'limits.receiver' for access param ${apIndex}`
            )
          )
        }

        if (o.limits.sendAmount) {
          if (!o.limits.sendAmount.value) {
            errors.push(
              new Error(
                `missing property 'limits.sendAmount.value' for access param ${apIndex}`
              )
            )
          }
          if (!o.limits.sendAmount.assetCode) {
            errors.push(
              new Error(
                `missing property 'limits.sendAmount.assetCode' for access param ${apIndex}`
              )
            )
          }
          if (!o.limits.sendAmount.assetScale) {
            errors.push(
              new Error(
                `missing property 'limits.sendAmount.assetScale' for access param ${apIndex}`
              )
            )
          }
        }

        if (o.limits.receiveAmount) {
          if (!o.limits.receiveAmount.value) {
            errors.push(
              new Error(
                `missing property 'limits.receiveAmount.value' for access param ${apIndex}`
              )
            )
          }
          if (!o.limits.receiveAmount.assetCode) {
            errors.push(
              new Error(
                `missing property 'limits.receiveAmount.assetCode' for access param ${apIndex}`
              )
            )
          }
          if (!o.limits.receiveAmount.assetScale) {
            errors.push(
              new Error(
                `missing property 'limits.receiveAmount.assetScale' for access param ${apIndex}`
              )
            )
          }
        }
      }

      if (errors.length > 0) {
        parsedParams.errors = parsedParams.errors.concat(...errors)
      } else {
        parsedParams.accesses.push({
          type: o.type,
          actions: o.actions,
          limits: o.limits
        })
      }
    })
  }

  if (queryParams.has('requestorName')) {
    parsedParams.requestorName = queryParams.getAsString('requestorName')
  }

  if (queryParams.has('returnUrl')) {
    parsedParams.returnUrl = queryParams.getAsString('returnUrl')
  }

  if (!parsedParams.requestorName) {
    parsedParams.errors.push(new Error("missing property 'requestorName'"))
  }

  if (!parsedParams.returnUrl) {
    parsedParams.errors.push(new Error("missing property 'returnUrl'"))
  }

  if (parsedParams.accesses.length < 1) {
    parsedParams.errors.push(new Error('no accesses provided'))
  }

  return parsedParams
}

function ConsentScreenBody({
  accesses,
  requestorName,
  returnUrl
}: {
  accesses: Array<Access>
  requestorName: string
  returnUrl: string
}) {
  const acceptRequest = () => {
    window.location.href =
      returnUrl +
      (returnUrl.includes('?') ? '&decision=accept' : '?decision=accept')
  }

  const rejectRequest = () => {
    window.location.href =
      returnUrl +
      (returnUrl.includes('?') ? '&decision=reject' : '?decision=reject')
  }

  return (
    <>
      <h2 className='display-6 fw-bold'>
        {requestorName} wants to use your account
      </h2>
      <div className='col-10 px-1'>
        <div className='row'>
          <div className='col-12'>
            <p className='lead mb-4'>
              {requestorName} has requested access to your account with the
              following permissions:
            </p>
          </div>
        </div>

        <div className='row' hidden={accesses.length < 1}>
          {accesses.length > 0 ? (
            <div className='col-6'>
              <AccessOverviewRow
                accessType={accesses[0].type}
                actions={accesses[0].actions}
                limits={accesses[0].limits}
              />
            </div>
          ) : (
            <></>
          )}
          {accesses.length > 1 ? (
            <div className='col-6'>
              <AccessOverviewRow
                accessType={accesses[1].type}
                actions={accesses[1].actions}
                limits={accesses[1].limits}
              />
            </div>
          ) : (
            <></>
          )}
        </div>
        <div className='row' hidden={accesses.length < 3}>
          {accesses.length > 2 ? (
            <div className='col-6'>
              <AccessOverviewRow
                accessType={accesses[2].type}
                actions={accesses[2].actions}
                limits={accesses[2].limits}
              />
            </div>
          ) : (
            <></>
          )}
          {accesses.length > 3 ? (
            <div className='col-6'>
              <AccessOverviewRow
                accessType={accesses[3].type}
                actions={accesses[3].actions}
                limits={accesses[3].limits}
              />
            </div>
          ) : (
            <></>
          )}
        </div>

        <div className='row'>
          <div className='col-12'>
            <p className='lead mt-3 mb-4'>
              If granted, you may revoke access at any time.
            </p>
          </div>
        </div>

        <div className='d-grid gap-2 d-sm-flex'>
          <a
            role='button'
            className='btn btn-primary btn-lg px-4 gap-3'
            onClick={() => acceptRequest()}
          >
            Accept
          </a>
          <a
            role='button'
            className='btn btn-outline-secondary btn-lg px-4'
            onClick={() => rejectRequest()}
          >
            Reject
          </a>
        </div>
      </div>
    </>
  )
}

export default function ConsentScreen() {
  const location = useLocation()
  const { accesses, requestorName, returnUrl, errors } =
    parseConsentScreenParams(location.search)

  return (
    <>
      <div style={{ padding: '1em' }}>
        <div className='row'>
          <div className='col-12'>
            <div className='px-4 py-2'>
              {errors.length > 0 ? (
                <>
                  <h2 className='display-6'>Invalid request</h2>
                  <ul>
                    {errors.map((e, ei) => (
                      <li className='text-danger' key={ei}>
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <ConsentScreenBody
                  accesses={accesses}
                  requestorName={requestorName}
                  returnUrl={returnUrl}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
