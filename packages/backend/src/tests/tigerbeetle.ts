import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'
import tmp from 'tmp'

import { Config } from '../config/app'

type TigerbeetleContainerOptions = {
  dir?: string
  port?: number
  clusterId?: number
  logsOn?: boolean
}

export async function startTigerbeetleContainer(
  options: TigerbeetleContainerOptions
): Promise<StartedTestContainer> {
  const dir = options.dir || Config.tigerbeetleDir
  const port = options.port || Config.tigerbeetlePort
  const clusterId = options.clusterId || Config.tigerbeetleClusterId
  const logsOn = options.logsOn || Config.tigerbeetleContainerLogs
  const { name: tigerbeetleDir } = tmp.dirSync({ unsafeCleanup: true })
  // TODO const @jason (waiting for TB 0.10.0): tigerBeetleFile = `${TIGERBEETLE_DIR}/cluster_${clusterId}_replica_0_test.tigerbeetle`

  const tbContFormat = await new GenericContainer(
    'ghcr.io/coilhq/tigerbeetle@sha256:c312832a460e7374bcbd4bd4a5ae79b8762f73df6363c9c8106c76d864e21303'
  )
    .withExposedPorts(port)
    .withBindMounts([
      {
        source: tigerbeetleDir,
        target: dir
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'init',
      '--cluster=' + clusterId,
      '--replica=0',
      '--directory=' + dir
    ])
    .withWaitStrategy(Wait.forLogMessage(/initialized data file/))
    .start()

  const streamTbFormat = await tbContFormat.logs()
  if (logsOn) {
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
    .withExposedPorts(port)
    .withBindMounts([
      {
        source: tigerbeetleDir,
        target: dir
      }
    ])
    .withAddedCapabilities('IPC_LOCK')
    .withCommand([
      'start',
      '--cluster=' + clusterId,
      '--replica=0',
      '--addresses=0.0.0.0:' + port,
      '--directory=' + dir
    ])
    .withWaitStrategy(Wait.forLogMessage(/listening on/))
    .start()

  const streamTbStart = await tbContStart.logs()
  if (logsOn) {
    streamTbStart
      .on('data', (line) => console.log(line))
      .on('err', (line) => console.error(line))
      .on('end', () => console.log('Stream closed for [tb-start]'))
  }
  return tbContStart
}
