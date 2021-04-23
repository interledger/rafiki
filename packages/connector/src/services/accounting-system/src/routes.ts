import createRouter, { Router, Joi } from 'koa-joi-router'
import { create as createSettlement } from './controllers/accountSettlementController'
import { create as createMessage } from './controllers/accountMessageController'
import { RafikiContext } from '@interledger/rafiki-core'

export function createSettlementApiRoutes (): Router {
  const router = createRouter()

  router.route({
    method: 'get',
    path: '/health',
    handler: (ctx: RafikiContext) => {
      ctx.body = 'Hello World!'
    }
  })

  router.route({
    method: 'post',
    path: '/accounts/:id/settlement',
    validate: {
      params: {
        id: Joi.string().required()
      },
      body: {
        amount: Joi.string().required(),
        scale: Joi.number().required()
      },
      type: 'json'
    },
    handler: createSettlement
  })

  router.route({
    method: 'post',
    path: '/accounts/:id/messages',
    validate: {
      params: {
        id: Joi.string().required()
      }
    },
    handler: createMessage
  })

  return router
}
