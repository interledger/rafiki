import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import tmp from 'tmp'

import { Config } from '../config/app'

const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'
export const TIGERBEETLE_PORT = 3004

export async function startTigerbeetleContainer(
  clusterId: number = Config.tigerbeetleClusterId
): Promise<StartedTestContainer> {
  const { name: tigerbeetleDir } = tmp.dirSync({ unsafeCleanup: true })
  // TODO const tigerBeetleFile = `${TIGERBEETLE_DIR}/cluster_${clusterId}_replica_0_test.tigerbeetle`

  await new GenericContainer(
    'ghcr.io/coilhq/tigerbeetle@sha256:c312832a460e7374bcbd4bd4a5ae79b8762f73df6363c9c8106c76d864e21303'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
    .withPrivilegedMode()
    .withCmd([
      'init',
      '--cluster=' + clusterId,
      '--replica=0',
      '--directory=' + TIGERBEETLE_DIR
    ])
    .withWaitStrategy(Wait.forLogMessage(/initialized data file/))
    .start()

  // Give TB a chance to startup (no message currently to notify allocation is complete):
  await new Promise((f) => setTimeout(f, 1000))

  return await new GenericContainer(
    'ghcr.io/coilhq/tigerbeetle@sha256:c312832a460e7374bcbd4bd4a5ae79b8762f73df6363c9c8106c76d864e21303'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
    .withPrivilegedMode()
    .withCmd([
      'start',
      '--cluster=' + clusterId,
      '--replica=0',
      '--addresses=0.0.0.0:' + TIGERBEETLE_PORT,
      '--directory=' + TIGERBEETLE_DIR
    ])
    .withWaitStrategy(Wait.forLogMessage(/listening on/))
    .start()
}
