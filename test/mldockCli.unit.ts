import * as path from 'path'
import { spawn } from 'child_process'
import { expect, assert } from 'chai'
import * as fsx from 'fs-extra'
const getPort = require('get-port')
const ip = require('ip')
import * as Docker from 'dockerode'
import * as sinon from 'sinon'

import * as handlers from '../src/cli/handlers'
import * as downloadCli from '../src/cli/cli-download'
import * as buildCli from '../src/cli/cli-build'

import * as util from './util.unit'
import {
  DevCreds,
  MlVersion,
  MlDock,
  ContainerRuntimeRef,
  ProgressFollower,
  defaultFollower
} from '../src'

function runCli(args: string[]): Promise<string> {
  const cliPath = path.resolve('build/src/cli/cli.js')
  const nycPath = path.resolve('node_modules/.bin/nyc')
  return new Promise((res, rej) => {
    const cp = spawn(
      nycPath,
      [ process.execPath, cliPath, ...args ],
      {
        env: Object.assign({ FORCE_COLOR: true }),
        shell: true,
        detached: true,
        stdio: 'pipe',
      }
    )
    cp.stdout.on('data', (data) => {
      const line = data.toString().trim()
      console.log(line)
    })
    cp.on('exit', (code) => {
      code ? rej(new Error('Process exited with code: ' + code)) : res()
    })
  })
}

function stubDownload(sb: sinon.SinonSandbox, stub: (
  version?: string | MlVersion,
  targetDirectory?: string,
  credentials?: DevCreds,
  overwriteIfPresent?: boolean,
  progressFollower?: ProgressFollower
) => Promise<string>) {
  return sb.stub(MlDock.prototype, 'downloadVersion').callsFake(stub)
}


module.exports = () =>
describe('mldock cli', function () {
  let context: util.TestContext

  before(function () {
    context = util.getContext()
  })

  after(function () {
    return context.mldock.removeVersion(context.version)
  })

  it('builds MarkLogic image from a local rpm file in the docker host', function () {
    util.speedFactor(this, 987)

    const downloadArgs = [
      'download',
      '-d',
      util.testDownloadDir,
      '-e',
      process.env.MARKLOGIC_DEV_EMAIL!,
      '-p',
      process.env.MARKLOGIC_DEV_PASSWORD!,
      context.version.toString()
    ]
    const buildArgs = [
      'build',
      '-o',
      '-r',
      'test-mldock',
      '-f',
      path.join(util.testDownloadDir, context.version.downloadUrl.match(/([^\/]+)$/)![1]),
      context.version.toString()
    ]
    return fsx.remove(util.testDownloadDir)
    .then(() => fsx.mkdirp(util.testDownloadDir))
    .then(() => runCli(downloadArgs))
    .then(() => runCli(buildArgs))
    .then(() => util.createBasicHost(context.mldock, context.version, defaultFollower))
    .then((ct) => {
      return context.mldock.startHostHealthy(ct.id!, 30, defaultFollower)
      .then(() => context.mldock.removeAll())
    })
  })

  describe('params parsing', function () {
    function errorHandlerStub(expectFunc: Function) {
      return sandbox.stub(handlers, 'handleError').callsFake((
        err: Error | string | number
      ) => expectFunc(err))
    }

    let sandbox: sinon.SinonSandbox
    let ehStub: sinon.SinonStub
    sandbox = sinon.sandbox.create()
    beforeEach(function () {
      ehStub = errorHandlerStub((err: Error) => { throw err })
    })
    afterEach(function () {
      sandbox.restore()
    })

    it('download should error if missing email', function () {
      const missingEmailParams = [
        path.resolve('build/src/cli/cli-download.js'),
        'download',
        '-d',
        util.testDownloadDir,
        '-p',
        process.env.MARKLOGIC_DEV_PASSWORD!,
        context.version.toString()
      ]
      return downloadCli.runProgram(missingEmailParams)
      .then(() => {
        assert(false, 'should error running program with bad args')
      }, (err) => {
        expect(ehStub.callCount).to.equal(1)
        expect(ehStub.firstCall.args[0]).to.be.an.instanceOf(Error)
      })
    })

    it('download should error if bad credentials', function () {
      util.speedFactor(this, 8)
      const badCredentials = [
        path.resolve('build/src/cli/cli-download.js'),
        'download',
        '-d',
        util.testDownloadDir,
        '-o',
        '-e',
        'joe@example.com',
          '-p',
        'bad password',
        context.version.toString()
      ]
      return downloadCli.runProgram(badCredentials)
      .then(() => {
        assert(false, 'should error running program with bad args')
      }, (err) => {
        expect(err.message).to.match(/Bad email/)
      })
    })

    it('build should error if insufficient source params', function () {
      util.speedFactor(this, 8)
      const missingFile = [
        path.resolve('build/src/cli/cli-build.js'),
        'build',
        '-p',
        'the problem is the missing email address',
        '-o',
        context.version.toString()
      ]
      return buildCli.runProgram(missingFile)
      .then(() => {
        assert(false, 'should error running program with bad args')
      }, (err) => {
        expect(err.message).to.match(/action requires at least/)
      })
    })

    it('build should error if file not found', function () {
      util.speedFactor(this, 8)
      const missingFile = [
        path.resolve('build/src/cli/cli-build.js'),
        'build',
        '-f',
        'not-a-real-file.rpm',
        '-o',
        context.version.toString()
      ]
      return buildCli.runProgram(missingFile)
      .then(() => {
        assert(false, 'should error running program with bad args')
      }, (err) => {
        expect(err.message).to.match(/File not found/)
      })
    })
  })
})
