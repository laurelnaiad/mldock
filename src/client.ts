import * as path from 'path'
import * as fsx from 'fs-extra'
import * as Docker from 'dockerode'

import {
  HashMap,
  repeatUntilEmpty,
} from './util'
import { LibOptions } from './mldock'
import { DevCreds } from './rpmDownload'
import { ProgressFollower } from './progressTracker'
import {
  MlVersion,
  sha1
} from './version'
import {
  TEMP_DIR,
  MlDockClientBase,
  DockerResourceId,
  ContainerRuntimeRef,
  HealthCheckSpec,
} from './clientBase'

export {
  ContainerRuntimeRef,
  ProgressFollower,
  HealthCheckSpec
}

export class MlDockClient extends MlDockClientBase {
  constructor(public libOptions: LibOptions, dockerOptions?: Docker.DockerOptions) {
    super(libOptions, dockerOptions)
  }

  getTagForVersion(version: string | MlVersion) {
    return `${this.libOptions.repo}-marklogic:${
      (typeof version === 'string' ? new MlVersion(version) : version).toDotString()
    }`
  }

  inspectVersion(version: MlVersion) {
    const img = this.getImage(this.getTagForVersion(version))
    return img.inspect()
  }

  isVersionPresent(
    version: MlVersion,
    progressFollower: ProgressFollower
  ) {
    return this.listImages({
      filters: {
        reference: [ `${this.libOptions.repo}-marklogic:${version.toDotString()}` ]
      }
    })
    .then((images) => images.length > 0)
  }

  ensureOSImage(options: {
    baseImage?: string,
    version: MlVersion,
    progressFollower: ProgressFollower
  }): Promise<DockerResourceId> {
    const imgName = `${this.libOptions.repo}-os:${options.version.compatibleCentos}-compat`
    const listed: any = this.listImages({
      filters: {
        reference: [ imgName ]
      }
    })
    return listed
    .then((matching: Docker.ImageInfo[]) => {
      if (!matching[0]) {
        return this.buildOSImage(options)
      }
    })
    .then(() => imgName)
  }

  buildOSImage(options: {
    baseImage?: string,
    version: MlVersion,
    progressFollower: ProgressFollower
  }): Promise<DockerResourceId> {
    const imageName = `${this.libOptions.repo}-os:${options.version.compatibleCentos}-compat`
    const contextPath = path.join(TEMP_DIR, 'build-' + imageName.replace(/\:/g, '_'))

    return fsx.mkdirp(contextPath)
    .then(() => fsx.copy(
      path.join(__dirname, 'dockerFiles/mlrun.sh'),
      path.join(contextPath, 'mlrun.sh'))
    )
    .then(() => fsx.copy(
      path.join(__dirname, 'dockerFiles/mldownload.sh'),
      path.join(contextPath, 'mldownload.sh'))
    )
    .then(() => fsx.copy(
      path.join(__dirname, `dockerFiles/${options.version.compatibleCentos}.Dockerfile`),
      path.join(contextPath, `Dockerfile`))
    )
    .then(() => this.buildMlDockImage({
      friendlyReference: imageName.replace(/^[^\:]+\:/, ''),
      imageName,
      dockerFile: path.join(contextPath, `Dockerfile`),
      contextPath,
      version: options.version,
      files: [ ],
      buildargs: {
        osImage: options.baseImage || `centos:${options.version.compatibleCentos}`,
      },
      progressFollower: options.progressFollower
    }))
    .then(() => fsx.remove(contextPath))
    .then(() => {
      options.progressFollower(undefined)
      return imageName
    })
  }

  buildMarkLogicVersion(options: {
    version: MlVersion,
    rpmSource: string | DevCreds,
    baseImage?: string,
    progressFollower: ProgressFollower,
  }) : Promise<string> {
    const rpmSource = options.rpmSource
    if (typeof rpmSource === 'string' && !fsx.existsSync(rpmSource)) {
      return Promise.reject(new Error('File not found: ' + rpmSource))
    }
    return this.ensureOSImage(options)
    .then(osImage => {
      const contextPath = typeof rpmSource === 'string' ?
          path.dirname(path.resolve(rpmSource)) :
          path.join(TEMP_DIR, 'build-' + options.version.toDotString().replace(/\./g, '_'))
      let rpmFile: string | undefined = undefined
      const files: string[] = []
      return fsx.copy(
        path.join(__dirname, (typeof rpmSource === 'string' ?
            'dockerFiles/rpmLocal.Dockerfile' :
            'dockerFiles/rpmDownload.Dockerfile'
        )),
        path.join(contextPath, 'Dockerfile')
      )
      .then(() => {
        files.push('mldownload.sh')
        return fsx.copy(
          path.join(__dirname, 'dockerFiles/mldownload.sh'),
          path.join(contextPath, 'mldownload.sh')
        )
      })
      .then(() => {
        files.push('mlrun.sh')
        return fsx.copy(
          path.join(__dirname, 'dockerFiles/mlrun.sh'),
          path.join(contextPath, 'mlrun.sh')
        )
      })
      .then(() => {
        if (typeof rpmSource === 'string') {
          rpmFile = path.basename(rpmSource)
          files.push(rpmFile)
        }
        const buildargs = {
          version: options.version.toDotString(),
          sha: sha1[options.version.toString()],
          osImage,
          rpmFile,
          email: (<DevCreds>rpmSource).email,
          password: (<DevCreds>rpmSource).password,
          rawUrl: options.version.downloadUrl,
        }
        const imageName = `${this.libOptions.repo}-marklogic:${options.version.toDotString()}`
        return this.buildMlDockImage({
          version: options.version,
          imageName,
          friendlyReference: 'MarkLogic ' + options.version.toString(),
          dockerFile: path.resolve(contextPath, 'Dockerfile'),
          contextPath,
          files,
          buildargs,
          progressFollower: options.progressFollower
        })
        .then(() => {
          options.progressFollower(undefined, 'pruning images')
          return this.pruneImages()
        })
        .then(() => {
          options.progressFollower(undefined)
          return imageName
        })
      })
    })
  }


  removeMlDockResources(
    version: MlVersion | undefined,
    progressFollower: ProgressFollower
  ) {
    const filters = { label: [ `${this.libOptions.domain}.repo=${this.libOptions.repo}` ] }
    if (version) {
      filters.label.push(`${this.libOptions.domain}.version=${version.toDotString()}`)
    }
    return this.listImages({ filters })
    .then(images => repeatUntilEmpty(images, (image) => {
      return this.listContainers({
        all: true,
        filters: { ancestor: [ image.Id.match(/([^\:]*)$/)![1] ] }
      })
      .then(containers => repeatUntilEmpty(containers, (container) => {
        return this.wipeMarkLogicContainer(container.Id, progressFollower)
      }))
      .then(() => this.wipeMarkLogicImage(image.Id, progressFollower))
    }))
    .then(() => this.pruneImages())
    .then(() => progressFollower(undefined))
  }

  private pollEvents(
    from: Date,
    timeoutSeconds: number,
    container: string,
  ) {
    return new Promise((res, rej) => {
      this.getEvents({
        since: from.getTime() / 1000,
        until: (new Date().getTime() / 1000) + timeoutSeconds,
        container,
        filters: {
          'event': [ 'health_status' ]
        }
      }, (err: Error, stream?: NodeJS.ReadableStream) => {
        let finished = false
        setTimeout(() => {
          if (!finished) {
            finished = true
            stream && stream.removeAllListeners()
            rej(new Error(
              `Timed out after waiting ${timeoutSeconds}s for container to become healthy.`
            ))
          }
        }, timeoutSeconds * 1000)

        if (err) {
          finished = true
          stream && stream.removeAllListeners()
          rej(err)
        }
        else {
          stream!.once('data', (evt: { status: string }) => {
            const status = JSON.parse(evt.toString()).status
            if (status.match(/healthy/)) {
              finished = true
              stream!.removeAllListeners()
              res(container)
            }
          })
        }
      })
    })
  }

  startHealthy(
    startFunc: () => any,
    container: Docker.Container,
    timeoutSeconds: number,
    progressFollower: ProgressFollower
  ): Promise<Docker.Container> {
    const start = new Date()
    const startNum = start.getTime() / 1000
    let elapsed = 0
    startFunc()
    return new Promise((res, rej) => {
      const loop = () => {
        this.pollEvents(start, 1, container.id)
        .then(
          () => res(),
          (err: Error) => {
            if (err.toString().match(/Timed out/)) {
              const endNum = (new Date()).getTime() / 1000
              if (endNum - startNum > timeoutSeconds + 1) {
                rej(err)
              }
              else {
                loop()
              }
            }
            else {
              rej(err)
            }
          }
        )
      }
      loop()
    })
  }
}
