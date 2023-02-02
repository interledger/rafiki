import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import tmp from 'tmp'
import fs from 'fs'

import { Config } from '../config/app'

const TIGERBEETLE_PORT = 3004
const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'
const { name: TIGERBEETLE_DIR_HOST } = tmp.dirSync({ unsafeCleanup: true })
const TIGERBEETLE_CONTAINER_LOG =
  process.env.TIGERBEETLE_CONTAINER_LOG === 'true'

export async function startTigerbeetleContainer(
  clusterId?: number
): Promise<{ container: StartedTestContainer; port: number }> {
  const tigerbeetleClusterId = clusterId || Config.tigerbeetleClusterId

  const tigerbeetleFile = `cluster_${tigerbeetleClusterId}_replica_0_test.tigerbeetle`

  const tbContFormat = await new GenericContainer(
    'ghcr.io/tigerbeetledb/tigerbeetle@sha256:5a347fa46d42dbe2ea451d56874bf9906dcc51e5bb5339964f2d725524d20f65'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMounts([
      {
        source: TIGERBEETLE_DIR_HOST,
        target: TIGERBEETLE_DIR
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'format',
      '--cluster=' + tigerbeetleClusterId,
      '--replica=0',
      `${TIGERBEETLE_DIR}/${tigerbeetleFile}`
    ])
    .withWaitStrategy(
      Wait.forLogMessage(
        `info(main): 0: formatted: cluster=${tigerbeetleClusterId}`
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

  //copy formatted data file
  fs.copyFileSync(
    `${TIGERBEETLE_DIR_HOST}/${tigerbeetleFile}`,
    `${TIGERBEETLE_DIR_HOST}/${tigerbeetleFile}_copy`
  )

  const tbContStart = await new GenericContainer(
    'ghcr.io/tigerbeetledb/tigerbeetle@sha256:5a347fa46d42dbe2ea451d56874bf9906dcc51e5bb5339964f2d725524d20f65'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMounts([
      {
        source: TIGERBEETLE_DIR_HOST,
        target: TIGERBEETLE_DIR
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'start',
      '--addresses=0.0.0.0:' + TIGERBEETLE_PORT,
      `${TIGERBEETLE_DIR}/${tigerbeetleFile}`
    ])
    .withWaitStrategy(
      Wait.forLogMessage(
        `info(main): 0: cluster=${tigerbeetleClusterId}: listening on 0.0.0.0:${TIGERBEETLE_PORT}`
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

export function purgeTigerbeetleData(clusterId?: number): void {
  const tigerbeetleClusterId = clusterId || Config.tigerbeetleClusterId
  const tigerbeetleFile = `cluster_${tigerbeetleClusterId}_replica_0_test.tigerbeetle`

  fs.rmSync(`${TIGERBEETLE_DIR_HOST}/${tigerbeetleFile}`)
  fs.copyFileSync(
    `${TIGERBEETLE_DIR_HOST}/${tigerbeetleFile}_copy`,
    `${TIGERBEETLE_DIR_HOST}/${tigerbeetleFile}`
  )
}
