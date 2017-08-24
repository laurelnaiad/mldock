import * as Docker from 'dockerode'
import {
  MlVersion,
  MlDock,
  ProgressFollower,
  getDefaults
} from '../src'

export const testDownloadDir = 'build/test/rpmDownload'

export function speedFactor(mocha: any, factor: number) {
  mocha.timeout(factor * 1000)
  mocha.slow((factor / 3) * 1000)
}

export interface TestContext {
  mldock: MlDock,
  version: MlVersion
}
export function getContext(): TestContext {
  return {
    mldock: new MlDock(
      Object.assign({}, getDefaults(), { repo: 'test-mldock' })
    ),
    version: new MlVersion(process.env.MARKLOGIC_VERSION!)
  }
}

export function createBasicHost(
  mldock: MlDock,
  version: MlVersion,
  containerName: string,
  progressFollower: ProgressFollower
): Promise<Docker.Container> {
  const oneSecondInNano = 1000 * 1000000
  return mldock.createHostContainer({
    containerName,
    version,
    healthCheck: {
      Test: [
        'CMD-SHELL',
        `curl --silent --fail http://localhost:8001/admin/v1/timestamp || exit 1`
      ],
      Interval: oneSecondInNano,
      Timeout: oneSecondInNano,
      Retries: 12,
      StartPeriod: oneSecondInNano
    },
    progressFollower
  })
}

