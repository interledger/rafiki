import assert from 'assert'

import {
  QueryResolvers,
  ResolversParentTypes,
  ResolversTypes,
  Event,
  TypeResolveFn
} from '../generated/graphql'
import { parseAmount } from '../../open_payments/amount'
import {
  isAccountEvent,
  isAccountEventType
} from '../../open_payments/account/model'
import {
  isIncomingPaymentEvent,
  isIncomingPaymentEventType
} from '../../open_payments/payment/incoming/model'
import {
  isOutgoingPaymentEvent,
  isOutgoingPaymentEventType
} from '../../open_payments/payment/outgoing/model'
import { WebhookEvent } from '../../webhook/model'
import { ApolloContext } from '../../app'
import { getPageInfo } from '../../shared/pagination'
import { Pagination } from '../../shared/baseModel'

export const getEvents: QueryResolvers<ApolloContext>['events'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['EventsConnection']> => {
  const webhookService = await ctx.container.use('webhookService')
  const events = await webhookService.getPage(args)
  const pageInfo = await getPageInfo(
    (pagination: Pagination) => webhookService.getPage(pagination),
    events
  )
  return {
    pageInfo,
    edges: events.map((event: WebhookEvent) => ({
      cursor: event.id,
      node: eventToGraphql(event)
    }))
  }
}

export const getEventResolveType: TypeResolveFn<
  'IncomingPaymentEvent' | 'OutgoingPaymentEvent' | 'WebMonetizationEvent',
  ResolversParentTypes['Event'],
  ApolloContext
> = (parent, _ctx) => {
  if (isOutgoingPaymentEventType(parent.type)) {
    return 'OutgoingPaymentEvent'
  } else if (isIncomingPaymentEventType(parent.type)) {
    return 'IncomingPaymentEvent'
  } else if (isAccountEventType(parent.type)) {
    return 'WebMonetizationEvent'
  } else {
    // GraphQLError is thrown
    return null
  }
}

export const eventToGraphql = (event: WebhookEvent): Event => {
  if (isOutgoingPaymentEvent(event)) {
    return {
      id: event.id,
      type: event.type,
      data: {
        outgoingPayment: {
          ...event.data.outgoingPayment,
          sendAmount: parseAmount(event.data.outgoingPayment.sendAmount),
          receiveAmount: parseAmount(event.data.outgoingPayment.receiveAmount),
          sentAmount: parseAmount(event.data.outgoingPayment.sentAmount)
        }
      },
      createdAt: new Date(+event.createdAt).toISOString()
    }
  } else if (isIncomingPaymentEvent(event)) {
    return {
      id: event.id,
      type: event.type,
      data: {
        incomingPayment: {
          ...event.data.incomingPayment,
          incomingAmount: event.data.incomingPayment.incomingAmount
            ? parseAmount(event.data.incomingPayment.incomingAmount)
            : undefined,
          receivedAmount: parseAmount(event.data.incomingPayment.receivedAmount)
        }
      },
      createdAt: new Date(+event.createdAt).toISOString()
    }
  } else {
    assert.ok(isAccountEvent(event))
    return {
      id: event.id,
      type: event.type,
      data: {
        webMonetization: {
          ...event.data.webMonetization,
          amount: parseAmount(event.data.webMonetization.amount)
        }
      },
      createdAt: new Date(+event.createdAt).toISOString()
    }
  }
}
