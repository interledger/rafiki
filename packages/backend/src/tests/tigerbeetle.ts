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
    'tb-prior-lsm-test-local' //local image
    //'ghcr.io/coilhq/tigerbeetle@sha256:6b1ab1b0355ef254f22fe68a23b92c9559828061190218c7203a8f65d04e395b',//main-0.10.0
    //'ghcr.io/coilhq/tigerbeetle:debug-build-no-rel-safe@sha256:a8c0fb6c7f50acc5a83784ba8d7f96a749e2267da2e4135c97df65868f02cfb0' //Debug-0.10.0
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
    'tb-prior-lsm-test-local' //local image
    //'ghcr.io/coilhq/tigerbeetle@sha256:6b1ab1b0355ef254f22fe68a23b92c9559828061190218c7203a8f65d04e395b',//main-0.10.0
    //'ghcr.io/coilhq/tigerbeetle:debug-build-no-rel-safe@sha256:a8c0fb6c7f50acc5a83784ba8d7f96a749e2267da2e4135c97df65868f02cfb0' //Debug-0.10.0
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
