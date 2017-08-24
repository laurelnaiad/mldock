import * as path from 'path'
import * as fsx from 'fs-extra'
import * as Docker from 'dockerode'
import { Writable } from 'stream'
import { MlVersion } from './version'
const logUpdate = require('log-update')
const tar = require('tar-fs')

import {
  HashMap,
  repeatUntilEmpty,
} from './util'
import {
  LibOptions
} from './mldock'
import {
  DevCreds,
  downloadRpm
} from './rpmDownload'
import {
  ProgressFollower,
  progressToLogLines
} from './progressTracker'

export { ProgressFollower }
export type DockerResourceId = string
export interface ContainerRuntimeRef {
  id: string,
  ports: { [port: string]: number },
  containerInspect: Docker.ContainerInspectInfo
}
export const ML_RUN_CMD = ['/bin/bash', '-c', '/usr/local/bin/mlrun.sh']
export const DATA_DIR = '/var/opt/MarkLogic'
export const TEMP_DIR = path.join(__dirname, '.temp')

export interface HealthCheckSpec {
  Test: string[]
  Interval: number
  Timeout: number
  Retries: number
  StartPeriod: number
}

export class MlDockClientBase extends Docker {
  constructor(public libOptions: LibOptions, dockerOptions?: Docker.DockerOptions) {
    super(dockerOptions)
  }

  public recreateHostContainer(options: {
    containerName?: string,
    imageId: string,
    version: MlVersion,
    usingVolume?: string,
    healthCheck?: HealthCheckSpec
    progressFollower: ProgressFollower
  }): Promise<Docker.Container> {
    const param = {
      name: options.containerName,
      Image: options.imageId,
      Tty: true,
      Detach: true,
      HostConfig: {
        PublishAllPorts: true
      },
      Healthcheck: options.healthCheck,
      Volumes: options.usingVolume ? {
        [`src=${options.usingVolume},dst=${DATA_DIR}`]: {}
      } : undefined,
      Labels: {
        [`${this.libOptions.domain}`]: '',
        [`${this.libOptions.domain}.version`]: options.version.toDotString(),
        [`${this.libOptions.domain}.repo`]: this.libOptions.repo,
      },
    }
    return (options.containerName ?
      this.wipeMarkLogicContainer(options.containerName, options.progressFollower) :
      Promise.resolve()
    )
    .then(() => this.createContainer(param))
  }

  protected getIngoredFiles(directory: string, myFiles: string[]) {
    return fsx.readdirSync(directory)
    .filter(f => {
      return !!!myFiles.find(myF => myF === f) &&
          !(f === '.dockerignore' || f === 'Dockerfile')
    })
  }

  /**
   * Resolves to `id` of built image.
   * @param libOptions
   * @param options
   */
  protected buildMlDockImage(options: {
    imageName?: string,
    /** name in logs for the image */
    friendlyReference: string,
    dockerFile: string,
    contextPath: string,
    version: MlVersion,
    /** files to make available to build -- if not listed here, will be ignored */
    files: string[],
    /** docker buildargs */
    buildargs: HashMap<string| undefined>,
    progressFollower: ProgressFollower
  }): Promise<DockerResourceId> {
    options.progressFollower('preparing ' + options.friendlyReference)
    fsx.mkdirpSync(options.contextPath)
    const ignoredFiles = this.getIngoredFiles(
      options.contextPath,
      options.files
    )
    const tarred = tar.pack(options.contextPath, {
      ignore: (name: string) => !!ignoredFiles.find(f => !!path.basename(name).match(f))
    })
    const labels = {
      [`${this.libOptions.domain}`]: '',
      [`${this.libOptions.domain}.repo`]: this.libOptions.repo,
    }
    if (options.version) {
      labels[`${this.libOptions.domain}.version`] = options.version.toDotString()
    }
    options.progressFollower('building ' + options.friendlyReference)
    return this.buildImage(tarred, {
      t: options.imageName,
      buildargs: options.buildargs,
      labels
    })
    .then((stream) => progressToLogLines(stream, (line) => options.progressFollower(undefined, line)))
  }

  protected wipeMarkLogicContainer(
    id: string,
    progressFollower: ProgressFollower
  ) {
    progressFollower(`removing container ${id}`)
    const cont = this.getContainer(id)
    return cont.inspect().then(inspect => {
      if (inspect.State.Running) {
        return cont.stop()
        .then(() => cont.remove())
      }
      else {
        return cont.remove()
      }
    })
    .then(() => progressFollower(undefined))
  }

  protected wipeMarkLogicImage(
    id: string,
    progressFollower: ProgressFollower
  ): Promise<any> {
    progressFollower(`removing image ${id}`)
    const img = this.getImage(id)
    return img.remove()
    .then(() => progressFollower(undefined))
  }
}
