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
  downloadVersion(options: {
    version: string | MlVersion,
    targetDir: string,
    credentials: DevCreds,
    overwrite?: boolean,
    progressFollower?: ProgressFollower
  }): Promise<string> {
    const progressFollower = getProgressFollower(options.progressFollower)
    const v = this.getVersionObject(options.version)
    const {
      overwrite,
      ...myOpts
    } = options
    let overwriteTest: Promise<boolean>
    const fname = path.resolve(options.targetDir, v.rpmName)
    return (() => {
      if (fsx.existsSync(fname)) {
        if (!overwrite) {
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
    .then(() => downloadRpm({
      ...myOpts,
      version: this.getVersionObject(options.version),
      progressFollower
    }))
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
   * Sort of like docker run -- this function goes from zero to a running host
   * of the specified version, or just runs a host container or
   * returns a reference to a running container.
   *
   * * If the MarkLogic version image is not not present, downloads/builds version.
   * * If the host container (by name) is not present, creates the container.
   * * If the host container is not running, runs the host container and waits
   * for it to emit a `healthy` event.
   * * Inspects host, resolves to `ContainerRuntimeRef`.
   *
   * If the container is already running, then no assessment of its health is
   * made.
   */
  runHost(options: {
    containerName: string,
    version: string | MlVersion,
    /**
     * If given, this function should create a host container and result to a
     * `Docker.Container` for the container. The container *must* be
     * configured  with a health command that is consistent with the
     * `hostHealthyTimeout` (default is 10 seconds).
     *
     * If not specified, then a basic host is configured to provide access
     * to an unininitialized server is created. (In particular, its healthcheck
     * function will only work properly as long as marklogic is not yet bootstrapped
     * with security.)
     *
     */
    hostCreate?: (
      version: MlVersion,
      containerName: string,
      progressFollower: ProgressFollower
    ) => Promise<Docker.Container>,
    /**
     * **in seconds**
     *
     * Time to wait for host to become healthy after running container
     * @default: 10
    */
    hostHealthyTimeout?: number,
    /** either path to rpm file or credentials */
    rpmSource?: string | DevCreds,
    baseImage?: string,
    progressFollower?: ProgressFollower
  }): Promise<ContainerRuntimeRef> {
    const {
      containerName,
      hostCreate,
      hostHealthyTimeout,
      rpmSource,
      ...myOpts
    } = options
    const progressFollower = getProgressFollower(options.progressFollower)
    const version = this.getVersionObject(options.version)
    return this.client.isVersionPresent(version, progressFollower)
    .then((isPresent) => {
      if (!isPresent) {
        if (typeof rpmSource === 'string' || (<DevCreds>rpmSource).email) {
          return this.buildVersion({
            ...myOpts,
            rpmSource: <DevCreds>rpmSource
          })
          .then(() => this.inspectVersion(version))
        }
        else {
          throw new Error(
            `An image for MarkLogic ${version.toString()} is not present, and ` +
            `an \`rpmSource\` was not given`
          )
        }
      }
      else {
        return this.inspectVersion(version)
      }
    })
    .then((imageInspect) => {
      return this.client.listContainers({
        all: true,
        filters: { name: [ `^/${containerName}$` ] }
      })
      .then((containers) => {
        if (!containers.length) {
          if (hostCreate) {
            return hostCreate(version, containerName, progressFollower)
          }
          else {
            const oneSecondInNano = 1000 * 1000000
            return this.createHostContainer({
              version,
              containerName,
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
        }
        else {
          return Promise.resolve(this.client.getContainer(containerName))
        }
      })
      .then((ct) => {
        return this.hostInspect(ct.id!)
        .then((ctRtRef): Promise<any> => {
          if (
            ctRtRef.containerInspect.Config.Image !==
            `${this.libOptions.repo}-marklogic:${version.toDotString()}`
          ) {
            throw new Error(
            `Version mismatch -- a container ${containerName} exists, ` +
            `based on a different base: ${ctRtRef.containerInspect.Config.Image}`
            )
          }
          if (!ctRtRef.containerInspect.State.Running) {
            return this.startHostHealthy(
              containerName,
              hostHealthyTimeout || 30,
              progressFollower
            ).then(() => ct)
          }
          else {
            return Promise.resolve(ct)
          }
        })
      })
      .then((ct) => this.hostInspect(ct.id))
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
   * Stops (if it is running) a host container & remove it.
   */
  removeHost(
    containerRef: string | ContainerRuntimeRef,
    progressFollower?: ProgressFollower
  ): Promise<void> {
    progressFollower = getProgressFollower(progressFollower)
    let containerLocated: Promise<ContainerRuntimeRef>
    if (typeof containerRef === 'string') {
      containerLocated = this.hostInspect(containerRef)
    }
    else {
      containerLocated = Promise.resolve(containerRef)
    }
    return containerLocated.then((ctRtRef) => ctRtRef.containerInspect.State.Running ?
        ctRtRef.container.stop().then(() => ctRtRef) :
        Promise.resolve(ctRtRef)
    )
    .then((ctRtRef) => ctRtRef.container.remove())
  }

  /**
   * Stops & removes all containers using mldock images, removes images.
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
