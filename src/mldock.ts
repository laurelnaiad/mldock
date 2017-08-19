import * as path from 'path'
import { EventEmitter } from 'events'
import * as Docker from 'dockerode'
import * as fsx from 'fs-extra'
import { MlVersion } from './version'
import {
  DevCreds,
  downloadRpm,
} from './rpmDownload'

import {
  ContainerRuntimeRef,
  MlDockClient,
  ProgressFollower,
  HealthCheckSpec
} from './client'

export {
  Docker,
  DevCreds,
  MlDockClient,
  ContainerRuntimeRef
}
export interface LibOptions {
  domain: string,
  repo: string,
  tempDir: string,
}

const defaultOptions = {
  domain: 'io.mldock',
  repo: 'mldock',
  tempDir: path.resolve(__dirname, '.temp'),
}
export function getDefaults() {
  return { ...defaultOptions }
}

export const defaultFollower: ProgressFollower = (
  step: string | undefined, msg?: string
) => {
  console.log(step || '', msg && msg.replace(/\n*$/, '') || '')
}

export class MlDock extends EventEmitter {
  libOptions: LibOptions
  readonly client: MlDockClient

  constructor(
    libOptions: Partial<LibOptions> = defaultOptions,
    dockerOptions?: Docker.DockerOptions
  ) {
    super()
    this.libOptions = { ...defaultOptions, ...libOptions }
    this.client = new MlDockClient(this.libOptions, dockerOptions)
  }

  getTagForVersion(version: string | MlVersion) {
    return this.client.getTagForVersion(version)
  }

  getVersionObject(version: string | MlVersion) {
    return typeof version === 'string' ? new MlVersion(version) : version
  }

  inspectVersion(version: string | MlVersion) {
    return this.client.inspectVersion(this.getVersionObject(version))
  }

  downloadVersion(
    version: string | MlVersion,
    targetDirectory: string,
    credentials: DevCreds,
    overwriteIfPresent?: boolean,
    progressFollower?: ProgressFollower
  ): Promise<string> {
    progressFollower = progressFollower || ((_: string) => {})
    const v = this.getVersionObject(version)
    let overwriteTest: Promise<boolean>
    const fname = path.resolve(targetDirectory, v.rpmName)
    return (() => {
      if (fsx.existsSync(fname)) {
        if (!overwriteIfPresent) {
          return Promise.reject(new Error(`Cannot overwrite ${fname} -- \`overwriteIfPresent\` is not set`))
        }
        else {
          return Promise.resolve()
        }
      }
      else {
        return Promise.resolve()
      }
    })()
    .then(() => downloadRpm(
      targetDirectory,
      this.getVersionObject(version),
      credentials.email,
      credentials.password,
      progressFollower!
    ))
    .then((fname) => path.resolve(fname))
  }

  /**
   * Builds a specific version of MarkLogic as an image in the configured docker
   * repository.
   *
   * The MarkLogic image is stacked on a CentOS image which is pulled from the Docker
   * repository. The image is left in a state where the MarkLogic Server is
   * _initialized_, but not _bootstrapped_. This puts containers based on the image
   * in position to either join a cluster or to be the first host of a cluster.
   */
  buildVersion(
    version: string | MlVersion,
    /** either path to rpm file or credentials */
    source: string | DevCreds,
    overwrite?: boolean,
    progressFollower?: ProgressFollower
  ): Promise<string> {
    progressFollower = progressFollower || ((_: string) => {})
    const versionObj = this.getVersionObject(version)
    const image = this.client.getImage(this.getTagForVersion(versionObj))
    return image.inspect()
    .then((imageInfo) => overwrite, (err) => true)
    .then(doBuild => {
      if (doBuild) {
        return this.client.buildMarkLogicVersion(
          versionObj,
          source,
          progressFollower!,
        )
      }
      else {
        throw new Error(`Version ${ version } is already present in the host.`)
      }
    })
  }

  removeVersion(
    version: string | MlVersion,
    progressFollower?: ProgressFollower
  ): Promise<void> {
    progressFollower = progressFollower || ((_: string) => {})
    const versionObj = this.getVersionObject(version)
    return this.client.removeMlDockResources(versionObj, progressFollower)
  }

  removeAll(
    progressFollower?: ProgressFollower
  ): Promise<void> {
    progressFollower = progressFollower || ((_: string) => {})
    return this.client.removeMlDockResources(undefined, progressFollower)
  }

  createHostContainer(options: {
    version: MlVersion,
    containerName?: string,
    usingVolume?: string,
    healthCheck?: HealthCheckSpec,
    progressFollower?: ProgressFollower
  }) {
    const progressFollower = options.progressFollower || ((_: string) => {})
    const param = {
      ...options,
      progressFollower,
      imageId: `${this.libOptions.repo}-marklogic:${options.version.toDotString()}`,
    }
    return this.client.recreateHostContainer(param)
  }

  startHost(
    id: string,
  ): Promise<ContainerRuntimeRef> {
    return this.client.getContainer(id).start()
    .then(() => this.client.hostInspect(id))
  }

  startHostHealthy(
    id: string,
    timeoutSeconds: number,
    progressFollower?: ProgressFollower
  ) {
    progressFollower = progressFollower || ((_: string) => {})
    const ct = this.client.getContainer(id)
    progressFollower(`waiting for health_status healthy from ${id}`)
    return this.client.startHealthy(
      () => ct.start(),
      ct,
      timeoutSeconds,
      progressFollower
    )
    .then(ct => {
      progressFollower!(undefined, 'ok')
      progressFollower!(undefined)
      return ct
    })
  }
}
