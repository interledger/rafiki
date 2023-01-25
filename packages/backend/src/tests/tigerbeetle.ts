import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import tmp from 'tmp'

import { Config } from '../config/app'

const TIGERBEETLE_PORT = 3004
const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'
const TIGERBEETLE_CONTAINER_LOG =
  process.env.TIGERBEETLE_CONTAINER_LOG === 'true'

export async function startTigerbeetleContainer(
  clusterId?: number
): Promise<{ container: StartedTestContainer; port: number }> {
  const tigerbeetleClusterId = clusterId || Config.tigerbeetleClusterId
  const { name: tigerbeetleDir } = tmp.dirSync({ unsafeCleanup: true })
  // TODO const @jason (waiting for TB 0.10.0): tigerBeetleFile = `${TIGERBEETLE_DIR}/cluster_${clusterId}_replica_0_test.tigerbeetle`

  const tbContFormat = await new GenericContainer(
    'ghcr.io/coilhq/tigerbeetle@sha256:c312832a460e7374bcbd4bd4a5ae79b8762f73df6363c9c8106c76d864e21303'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMounts([
      {
        source: tigerbeetleDir,
        target: TIGERBEETLE_DIR
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'init',
      '--cluster=' + tigerbeetleClusterId,
      '--replica=0',
      '--directory=' + TIGERBEETLE_DIR
    ])
    .withWaitStrategy(Wait.forLogMessage(/initialized data file/))
    .start()

  const streamTbFormat = await tbContFormat.logs()
  if (TIGERBEETLE_CONTAINER_LOG) {
    streamTbFormat
      .on('data', (line) => console.log(line))
      .on('err', (line) => console.error(line))
      .on('end', () => console.log('Stream closed for [tb-format]'))
  }

  // Give TB a chance to startup (no message currently to notify allocation is complete):
  await new Promise((f) => setTimeout(f, 1000))

  const tbContStart = await new GenericContainer(
    'ghcr.io/coilhq/tigerbeetle@sha256:c312832a460e7374bcbd4bd4a5ae79b8762f73df6363c9c8106c76d864e21303'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMounts([
      {
        source: tigerbeetleDir,
        target: TIGERBEETLE_DIR
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'start',
      '--cluster=' + tigerbeetleClusterId,
      '--replica=0',
      '--addresses=0.0.0.0:' + TIGERBEETLE_PORT,
      '--directory=' + TIGERBEETLE_DIR
    ])
    .withWaitStrategy(Wait.forLogMessage(/listening on/))
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
