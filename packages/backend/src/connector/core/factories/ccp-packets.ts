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
  speaker: 'test.rafiki.' + faker.name.firstName(),
  routingTableId: faker.datatype.uuid,
  currentEpochIndex: faker.datatype.number({ min: 0, max: 5 }),
  fromEpochIndex: faker.datatype.number({ min: 0, max: 5 }),
  toEpochIndex: faker.datatype.number({ min: 0, max: 10 }),
  holdDownTime: faker.datatype.number({ min: 30000, max: 45000 }),
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
    lastKnownRoutingTableId: faker.datatype.uuid,
    mode: faker.datatype.number({ min: 0, max: 1 })
  })

export const RouteControlPreparePacketFactory = {
  build: (): IlpPrepare =>
    deserializeIlpPrepare(
      serializeCcpRouteControlRequest(RouteControlRequestFactory.build())
    )
}
