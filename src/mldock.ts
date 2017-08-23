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
  domain: 'org.npm.package.mldock',
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

function getProgressFollower(progressFollower?: ProgressFollower) {
  return progressFollower =
      progressFollower || /* istanbul ignore next */
      ((_: string) => {})
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
    progressFollower = getProgressFollower(progressFollower)
    const v = this.getVersionObject(version)
    let overwriteTest: Promise<boolean>
    const fname = path.resolve(targetDirectory, v.rpmName)
    return (() => {
      if (fsx.existsSync(fname)) {
        if (!overwriteIfPresent) {
          return Promise.reject(new Error(`Cannot overwrite ${fname} -- \`overwriteIfPresent\` is not set`))
        }
        else {
          return fsx.unlink(fname)
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
  buildVersion(options: {
    version: string | MlVersion,
    /** either path to rpm file or credentials */
    rpmSource: string | DevCreds,
    overwrite?: boolean,
    baseImage?: string,
    progressFollower?: ProgressFollower
  }): Promise<string> {
    const progressFollower = getProgressFollower(options.progressFollower)
    const versionObj = this.getVersionObject(options.version)
    const { overwrite, ...myOpts } = options
    return this.client.isVersionPresent(versionObj, progressFollower)
    .then((isPresent) => {
      if (isPresent && !overwrite) {
        throw new Error(`Version ${ options.version } is already present in the host.`)
      }
      else {
        return this.client.buildMarkLogicVersion({
          ...myOpts,
          progressFollower,
          version: versionObj
        })
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
    progressFollower = getProgressFollower(progressFollower)
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
    progressFollower = getProgressFollower(progressFollower)
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
    const progressFollower = getProgressFollower(options.progressFollower)
    const param = {
      ...options,
      progressFollower,
      imageId: `${this.libOptions.repo}-marklogic:${options.version.toDotString()}`,
    }
    return this.client.recreateHostContainer(param)
  }

  hostInspect(
    id: string,
  ): Promise<ContainerRuntimeRef> {
    return this.client.hostInspect(id)
  }

  /**
   * Starts a host container.
   */
  startHost(
    id: string,
  ): Promise<Docker.Container> {
    return this.client.getContainer(id).start()
  }

  /**
   * Starts a host container and waits for it to emit a healthy event.
   */
  startHostHealthy(
    id: string,
    timeoutSeconds: number,
    progressFollower?: ProgressFollower
  ) {
    progressFollower = getProgressFollower(progressFollower)
    progressFollower(`waiting for health_status healthy from ${id}`)
    const hostCt = this.client.getContainer(id)
    return this.client.startHealthy(
      () => this.startHost(id),
      hostCt,
      timeoutSeconds,
      progressFollower
    )
    .then(_ => {
      progressFollower!(undefined, 'ok')
      progressFollower!(undefined)
      return hostCt
    })
  }
}
