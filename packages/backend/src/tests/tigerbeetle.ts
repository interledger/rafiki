import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import tmp from 'tmp'

import { Config } from '../config/app'

const TIGERBEETLE_PORT = 3004
const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'
const TIGERBEETLE_CONTAINER_LOG =
  process.env.TIGERBEETLE_CONTAINER_LOG === 'true'

export async function startTigerbeetleContainer(clusterId?: number): Promise<{
  container: StartedTestContainer
  port: number
}> {
  const tigerBeetleClusterId = clusterId || Config.tigerBeetleClusterId
  const { name: tigerBeetleDir } = tmp.dirSync({ unsafeCleanup: true })
  const tigerBeetleFile = `cluster_${tigerBeetleClusterId}_replica_0_test.tigerbeetle`
  const tigerBeetleContainerVersion = 'ghcr.io/tigerbeetle/tigerbeetle:0.15.3'

  const tbContFormat = await new GenericContainer(tigerBeetleContainerVersion)
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMounts([
      {
        source: tigerBeetleDir,
        target: TIGERBEETLE_DIR
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'format',
      '--cluster=' + tigerBeetleClusterId,
      '--replica=0',
      '--replica-count=1',
      `${TIGERBEETLE_DIR}/${tigerBeetleFile}`
    ])
    .withWaitStrategy(
      Wait.forLogMessage(
        `info(main): 0: formatted: cluster=${tigerBeetleClusterId} replica_count=1`
      )
    )
    .start()

  const streamTbFormat = await tbContFormat.logs()
  if (TIGERBEETLE_CONTAINER_LOG) {
    streamTbFormat
      .on('data', (line) => console.log(line))
      .on('err', (line) => console.error(line))
      .on('end', () => console.log('Stream closed for [tb-format]'))
  }

  const tbContStart = await new GenericContainer(tigerBeetleContainerVersion)
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMounts([
      {
        source: tigerBeetleDir,
        target: TIGERBEETLE_DIR
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'start',
      '--addresses=0.0.0.0:' + TIGERBEETLE_PORT,
      `${TIGERBEETLE_DIR}/${tigerBeetleFile}`
    ])
    .withWaitStrategy(
      Wait.forLogMessage(
        `info(main): 0: cluster=${tigerBeetleClusterId}: listening on 0.0.0.0:${TIGERBEETLE_PORT}`
      )
    )
    .start()

  const streamTbStart = await tbContStart.logs()
  if (TIGERBEETLE_CONTAINER_LOG) {
    streamTbStart
      .on('data', (line) => console.log(line))
      .on('err', (line) => console.error(line))
      .on('end', () => console.log('Stream closed for [tb-start]'))
  }
  return {
    container: tbContStart,
    port: tbContStart.getMappedPort(TIGERBEETLE_PORT)
  }
}
