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
  ports: { [port: string]: string },
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

  public recreateHostContainer(
    params: {
      containerName?: string,
      imageId: string,
      version: MlVersion,
      usingVolume?: string,
      healthCheck?: HealthCheckSpec
      progressFollower: ProgressFollower
    },
  ): Promise<Docker.Container> {
    const param = {
      name: params.containerName,
      Image: params.imageId,
      Tty: true,
      Detach: true,
      HostConfig: {
        PublishAllPorts: true
      },
      Healthcheck: params.healthCheck,
      Volumes: params.usingVolume ? {
        [`src=${params.usingVolume},dst=${DATA_DIR}`]: {}
      } : undefined,
      Labels: {
        [`${this.libOptions.domain}`]: '',
        [`${this.libOptions.domain}.version`]: params.version.toDotString(),
        [`${this.libOptions.domain}.repo`]: this.libOptions.repo,
      },
    }
    return (params.containerName ?
      this.wipeMarkLogicContainer(params.containerName, params.progressFollower) :
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
   * @param params
   */
  protected buildMlDockImage(
    params: {
      imageName?: string,
      /** name in logs for the image */
      friendlyReference: string,
      dockerFile: string,
      contextPath: string,
      forVersion?: MlVersion,
      /** files to make available to build -- if not listed here, will be ignored */
      files: string[],
      /** docker buildargs */
      buildargs: HashMap<string| undefined>,
    },
    progressFollower: ProgressFollower
  ): Promise<DockerResourceId> {
    progressFollower('preparing ' + params.friendlyReference)
    fsx.mkdirpSync(params.contextPath)
    const ignoredFiles = this.getIngoredFiles(
      params.contextPath,
      params.files
    )
    const tarred = tar.pack(params.contextPath, {
      ignore: (name: string) => !!ignoredFiles.find(f => !!path.basename(name).match(f))
    })
    const labels = {
      [`${this.libOptions.domain}`]: '',
      [`${this.libOptions.domain}.repo`]: this.libOptions.repo,
    }
    if (params.forVersion) {
      labels[`${this.libOptions.domain}.version`] = params.forVersion.toDotString()
    }
    progressFollower('building ' + params.friendlyReference)
    return this.buildImage(tarred, {
      t: params.imageName,
      buildargs: params.buildargs,
      labels
    })
    .then((stream) => progressToLogLines(stream, (line) => progressFollower(undefined, line)))
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
