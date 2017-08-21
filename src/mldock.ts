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

  /**
   * Returns the full repo/tag name for MarkLogic version
   */
  getTagForVersion(version: string | MlVersion) {
    return this.client.getTagForVersion(version)
  }

  /**
   * Helper function to ensure an instance of MlVersion in overloaded situtations
   */
  getVersionObject(version: string | MlVersion) {
    return typeof version === 'string' ? new MlVersion(version) : version
  }

  /**
   * Returns the result of inspecting a MarkLogic image.
   * @param version
   */
  inspectVersion(version: string | MlVersion) {
    return this.client.inspectVersion(this.getVersionObject(version))
  }

  /**
   * Downloads a MarkLogic .rpm file from developer.marklogic.com.
   */
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

  /**
   * Stops & removes all containers using a version images, then removes the version image.
   */
  removeVersion(
    version: string | MlVersion,
    progressFollower?: ProgressFollower
  ): Promise<void> {
    progressFollower = progressFollower || ((_: string) => {})
    const versionObj = this.getVersionObject(version)
    return this.client.removeMlDockResources(versionObj, progressFollower)
  }

  /**
   * Stops & removes all containers using mldock images, then the containers and images.
   * Does not remove base images.
   */
  removeAll(
    progressFollower?: ProgressFollower
  ): Promise<void> {
    progressFollower = progressFollower || ((_: string) => {})
    return this.client.removeMlDockResources(undefined, progressFollower)
  }

  /**
   * Creates a basic container host container.
   */
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

  /**
   * Starts a host container and returns the results of inspecting it..
   */
  startHost(
    id: string,
  ): Promise<ContainerRuntimeRef> {
    return this.client.getContainer(id).start()
    .then(() => this.client.hostInspect(id))
  }

  /**
   * Starts a host container and waits for it to emit a healthy event.
   */
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
