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

  protected writeIgnoreFile(directory: string, myFiles: string[]) {
    const files = fsx.readdirSync(directory)
      .filter(f => {
        return !!!myFiles.find(myF => myF === f) &&
            !(f === '.dockerignore' || f === 'Dockerfile')
      })
      .join('\n') + '\n'
    return fsx.writeFile(
      path.join(directory, '.dockerignore'),
      files,
      { encoding: 'utf8' }
    )
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
    const step = 'preparing ' + params.friendlyReference
    progressFollower(step)
    fsx.mkdirpSync(params.contextPath)
    return this.writeIgnoreFile(
      params.contextPath,
      params.files || []
    )
    .then(() => {
      const step = 'building ' + params.friendlyReference
      progressFollower(step)
      const tarred = tar.pack(params.contextPath)
      const labels = {
        [`${this.libOptions.domain}`]: '',
        [`${this.libOptions.domain}.repo`]: this.libOptions.repo,
      }
      if (params.forVersion) {
        labels[`${this.libOptions.domain}.version`] = params.forVersion.toDotString()
      }
      return this.buildImage(tarred, {
        t: params.imageName,
        buildargs: params.buildargs,
        labels
      })
    })
    .then((stream) => progressToLogLines(stream, (line) => progressFollower(undefined, line)))
  }

  protected handleError404Ok(err: Error & { statusCode?: number } | string) {
    if (err instanceof Error) {
      if (!(err.statusCode === 404 || err.message.match(/unrecognized image ID/))) {
        throw err
      }
    }
    else {
      throw new Error(err)
    }
  }

  protected wipeMarkLogicContainer(
    id: string,
    progressFollower: ProgressFollower
  ) {
    const step = `removing container ${id} and its dependencies`
    progressFollower(step)
    const cont = this.getContainer(id)
    return cont.inspect().then(inspect => {
      if (inspect.State.Running) {
        return cont.stop()
        .then(() => cont.remove())
      }
      else {
        return cont.remove()
      }
    }, (err) => this.handleError404Ok(err))
  }

  protected wipeMarkLogicImage(
    id: string,
    progressFollower: ProgressFollower
  ): Promise<any> {
    const step = `removing image ${id} and its dependencies`
    progressFollower(step)
    return this.getDependentImages(id)
    .then(deps => {
      return repeatUntilEmpty(deps, (dep) => {
        const img = this.getImage(id)
        return img.inspect().then(
          inspect => img.remove()
          .then(res => res, err => {
            if (err.statusCode === 409) {
              deps.push(dep)
            }
            else {
              throw err
            }
          }),
          (err) => this.handleError404Ok(err)
        )
      })
    })
  }

  protected getDependentImages(id: string) {
    function listLen(depsMap: HashMap<string>, depId: string) {
      let i = 0

      while (depsMap[depId]) {
        depId = depsMap[depId]
        i++
      }
      return i
    }

    return this.listImages({
      since: id
    })
    .then((dependents) => {
      const depsMap = dependents.reduce<HashMap<string>>((acc, d) => {
        return Object.assign(acc, { [d.ParentId]: d.Id })
      }, {})
      return dependents.sort((a, b) => {
        if (depsMap[a.Id] === b.Id) {
          return -1
        }
        if (depsMap[b.Id] === a.Id) {
          return 1
        }
        const aLen = listLen(depsMap, a.Id)
        const bLen = listLen(depsMap, b.Id)
        return aLen - bLen
      })
    })
  }
}
