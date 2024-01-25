import { Factory } from 'rosie'
import {
  CcpRouteUpdateRequest,
  serializeCcpRouteUpdateRequest,
  CcpRouteControlRequest,
  serializeCcpRouteControlRequest
} from 'ilp-protocol-ccp'
import { faker } from '@faker-js/faker'
import { deserializeIlpPrepare, IlpPrepare } from 'ilp-packet'

export const RouteUpdateRequestFactory = Factory.define<CcpRouteUpdateRequest>(
  'RouteUpdateRequest'
).attrs({
  speaker: 'test.rafiki.' + faker.person.firstName(),
  routingTableId: faker.string.uuid,
  currentEpochIndex: faker.number.int({ min: 0, max: 5 }),
  fromEpochIndex: faker.number.int({ min: 0, max: 5 }),
  toEpochIndex: faker.number.int({ min: 0, max: 10 }),
  holdDownTime: faker.number.int({ min: 30000, max: 45000 }),
  newRoutes: [],
  withdrawnRoutes: new Array<string>()
})

export const RouteUpdatePreparePacketFactory = {
  build: (): IlpPrepare =>
    deserializeIlpPrepare(
      serializeCcpRouteUpdateRequest(RouteUpdateRequestFactory.build())
    )
}

export const RouteControlRequestFactory =
  Factory.define<CcpRouteControlRequest>('RouteControlRequest').attrs({
    features: new Array<string>(),
    lastKnownEpoch: 0,
    lastKnownRoutingTableId: faker.string.uuid,
    mode: faker.number.int({ min: 0, max: 1 })
  })

export const RouteControlPreparePacketFactory = {
  build: (): IlpPrepare =>
    deserializeIlpPrepare(
      serializeCcpRouteControlRequest(RouteControlRequestFactory.build())
    )
}
