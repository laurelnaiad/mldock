import * as path from 'path'
import { expect, assert } from 'chai'
import * as fsx from 'fs-extra'
const getPort = require('get-port')
const ip = require('ip')
import * as Docker from 'dockerode'

import * as util from './util.unit'
import * as cmdFuncs from '../src/cli/commands'
import {
  DevCreds,
  MlVersion,
  MlDock,
  ContainerRuntimeRef,
  ProgressFollower,
  defaultFollower
} from '../src'

module.exports = (dockerContainerId: string) =>
describe('mldock cli', function () {

  it('builds MarkLogic image from a local rpm file in the docker host', function () {
    util.speedFactor(this, 987)

    const {
      mldock, version
    } = util.getContext()
    const argvDownload = [
      path.resolve('../src/cli/cli'),
      'download',
      '-d',
      util.testDownloadDir,
      '-e',
      process.env.MARKLOGIC_DEV_EMAIL!,
      '-p',
      process.env.MARKLOGIC_DEV_PASSWORD!,
      version.toString()
    ]

    const argvBuildPartial = [
      path.resolve('../src/cli/cli'),
      'build',
      '-o',
      '-r',
      'test-mldock',
      '-f',
    ]
    return fsx.remove(util.testDownloadDir)
    .then(() => fsx.mkdirp(util.testDownloadDir))
    .then(() => cmdFuncs.cmdDownload(argvDownload))
    .then((filename) => cmdFuncs.cmdBuild(
      argvBuildPartial.concat([ filename, version.toString() ])
    ))
    .then(() => util.createBasicHost(mldock, version, defaultFollower))
    .then((ct) => {
      return mldock.startHostHealthy(ct.id!, 10, defaultFollower)
      .then(
        (resp) => {
          return ct.kill()
          .then(() => ct.remove())
          .then(() => mldock.removeVersion(version, defaultFollower))
          .then(() => assert(true))
        },
        (err) => assert(false, err.stack)
      )
    })
  })
})
