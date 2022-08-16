import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import tmp from 'tmp'

import { Config } from '../config/app'

const TIGERBEETLE_DIR = '/var/lib/tigerbeetle'
export const TIGERBEETLE_PORT = 3004

export async function startTigerbeetleContainer(
  clusterId: number = Config.tigerbeetleClusterId
): Promise<StartedTestContainer> {
  const { name: tigerbeetleDir } = tmp.dirSync({ unsafeCleanup: true })
  const tigerBeetleFile = `${TIGERBEETLE_DIR}/cluster_${clusterId}_replica_0_test.tigerbeetle`

  await new GenericContainer(
    'ghcr.io/coilhq/tigerbeetle@sha256:6b1ab1b0355ef254f22fe68a23b92c9559828061190218c7203a8f65d04e395b'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
    .withCmd([
      'format',
      `--cluster=${clusterId}`,
      '--replica=0',
      tigerBeetleFile
    ])
    .withWaitStrategy(Wait.forLogMessage(/allocating/)) //TODO @jason need to add more criteria (does not contain error)
    .start()

  return await new GenericContainer(
    'ghcr.io/coilhq/tigerbeetle@sha256:6b1ab1b0355ef254f22fe68a23b92c9559828061190218c7203a8f65d04e395b'
  )
    .withExposedPorts(TIGERBEETLE_PORT)
    .withBindMount(tigerbeetleDir, TIGERBEETLE_DIR)
    .withCmd([
      'start',
      `--addresses=0.0.0.0:${TIGERBEETLE_PORT}`,
      tigerBeetleFile
    ])
    .withWaitStrategy(Wait.forLogMessage(/listening on/))
    .start()
}
