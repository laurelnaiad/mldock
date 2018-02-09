import * as path from 'path'
import { spawn } from 'child_process'
import { expect, assert } from 'chai'
import * as fsx from 'fs-extra'
import * as Docker from 'dockerode'
const { Command } = require('commander')
import * as sinon from 'sinon'

import * as cli from '../src/cli/cli'
import * as downloadCli from '../src/cli/cli-download'
import * as buildCli from '../src/cli/cli-build'
import * as runCli from '../src/cli/cli-run'
import * as handlers from '../src/cli/handlers'

import * as util from './util.unit'
import {
  DevCreds,
  MlVersion,
  MlDock,
  ContainerRuntimeRef,
  ProgressFollower,
  defaultFollower
} from '../src'

const containerName = 'test-mldock-cli'

function spawnCli(args: string[]): Promise<string> {
  const cliPath = path.resolve('build/src/cli/cli.js')
  const nycPath = path.resolve('node_modules/.bin/nyc')
  return new Promise((res, rej) => {
    const cp = spawn(
      nycPath,
      [ process.execPath, cliPath, ...args ],
      {
        env: Object.assign({
          FORCE_COLOR: true,
          DOCKER_HOST: process.env.DOCKER_HOST
        }),
        shell: true,
        detached: true,
        stdio: 'pipe',
      }
    )
    cp.stdout.on('data', (data: any) => {
      const line = data.toString().trim()
      console.log(line)
    })
    cp.on('exit', (code: number) => {
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

function tagCentos(context: { mldock: MlDock, version: MlVersion }) {
  const mld = context.mldock
  const centos = `centos:${context.version.compatibleCentos}`
  return mld.client.pull(centos, {})
  .then(() => mld.client.getImage(centos).tag({
    repo: 'test-mldock',
    tag: 'test-image-override'
  }))
}

function isImageOverridden(context: { mldock: MlDock, version: MlVersion }) {
  const mld = context.mldock
  const tag = `centos:${context.version.compatibleCentos}`
  return mld.client.listImages({
    since: 'test-mldock:test-image-override'
  })
  .then((images) => {
    const myImage = images.find((i) => {

      return !!i.RepoTags.find((t) => {
        console.log(t)
        return t === `test-mldock-os:${context.version.compatibleCentos}-compat`
      })
    })
    expect(myImage, '').to.be.ok
  })
}

module.exports = () =>
describe('cli', function () {
  let downloadFile: string
  let context: util.TestContext

  function errorHandlerStub(sandbox: sinon.SinonSandbox, expectFunc: Function) {
    return sandbox.stub(handlers, 'handleError').callsFake((
      err: Error | string | number
    ) => expectFunc(err))
  }

  before(function () {
    util.speedFactor(this, 377)
    context = util.getContext()
    downloadFile = path.join(
      util.testDownloadDir,
      context.version.downloadUrl.match(/([^\/]+)$/)![1]
    )
    return tagCentos(context)
  })

  after(function () {
    util.speedFactor(this, 21)
    return context.mldock.removeVersion(context.version)
  })

  describe('download/build', function () {
    let sandbox: sinon.SinonSandbox
    let ehStub: sinon.SinonStub
    let liveContainer: Docker.Container

    beforeEach(function () {
      sandbox = sinon.sandbox.create()
      ehStub = errorHandlerStub(sandbox, (err: Error) => { throw err })
    })
    afterEach(function () {
      sandbox.restore()
    })

    after(function () {
      util.speedFactor(this, 21)
      // hit the `else` in wipeMarkLogicContainer by giving it a stopped container
      return liveContainer.stop()
      .then(() => context.mldock.removeVersion(context.version))
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
        '-o',
        context.version.toString()
      ]
      const buildArgs = [
        'build',
        '-o',
        '-r',
        'test-mldock',
        '-b',
        'test-mldock:test-image-override',
        '-f',
        downloadFile,
        context.version.toString()
      ]
      return fsx.remove(util.testDownloadDir)
      .then(() => fsx.mkdirp(util.testDownloadDir))
      .then(() => spawnCli(downloadArgs))
      .then(() => spawnCli(buildArgs))
      .then(() => isImageOverridden(context))
      .then(() => util.createBasicHost(
        context.mldock,
        context.version,
        containerName,
        defaultFollower
      ))
      .then((ct) => context.mldock.startHostHealthy(ct.id!, 30, defaultFollower))
      .then((ct) => liveContainer = ct)
    })

    it('download should error if try overwrite w/out option', function () {
      util.speedFactor(this, 8)
      const overwriteNotOptedIn = [
        path.resolve('build/src/cli/cli-download.js'),
        'download',
        '-d',
        util.testDownloadDir,
        '-e',
        process.env.MARKLOGIC_DEV_EMAIL!,
        '-p',
        process.env.MARKLOGIC_DEV_PASSWORD!,
        context.version.toString()
      ]
      const prog = downloadCli.downloadProgram()
      return cli.runProgram(
        prog,
        overwriteNotOptedIn,
        downloadCli.downloadCmd
      )
      .then(() => {
        assert(false, 'should error running program with bad args')
      }, (err) => {
        expect(ehStub.callCount).to.equal(1)
        expect(ehStub.firstCall.args[0].toString()).to.match(/Cannot overwrite/)
      })
    })

    it('build should error if try overwrite w/out option', function () {
      util.speedFactor(this, 8)
      const overwriteNotOptedIn = [
        path.resolve('build/src/cli/cli-build.js'),
        'build',
        '-r',
        'test-mldock',
        '-f',
        downloadFile,
        context.version.toString()
      ]
      const prog = buildCli.buildProgram()
      return cli.runProgram(
        prog,
        overwriteNotOptedIn,
        buildCli.buildCmd
      )
      .then(() => {
        assert(false, 'should error running program with bad args')
      }, (err) => {
        expect(ehStub.callCount).to.equal(1)
        expect(ehStub.firstCall.args[0].toString()).to.match(/is already present/)
      })
    })
  })

  describe('params parsing', function () {
    let sandbox: sinon.SinonSandbox
    let ehStub: sinon.SinonStub
    beforeEach(function () {
      sandbox = sinon.sandbox.create()
      ehStub = errorHandlerStub(sandbox, (err: Error) => { throw err })
    })
    afterEach(function () {
      sandbox.restore()
    })

    describe('download', function () {
      it('should error if missing email', function () {
        util.speedFactor(this, 8)
        const missingEmailParams = [
          path.resolve('build/src/cli/cli-download.js'),
          'download',
          '-o',
          '-d',
          util.testDownloadDir,
          '-p',
          process.env.MARKLOGIC_DEV_PASSWORD!,
          context.version.toString()
        ]
        const prog = downloadCli.downloadProgram()
        return cli.runProgram(
          prog,
          missingEmailParams,
          downloadCli.downloadCmd
        )
        .then(() => {
          assert(false, 'should error running program with bad args')
        }, (err) => {
          expect(ehStub.callCount).to.equal(1)
          expect((ehStub.firstCall.args[0] as Error).message).to.match(
            /The `download` command requires/
          )
        })
      })

      it('should error if bad credentials', function () {
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
        const prog = downloadCli.downloadProgram()
        return cli.runProgram(
          prog,
          badCredentials,
          downloadCli.downloadCmd
        )
        .then(() => {
          assert(false, 'should error running program with bad args')
        }, (err) => {
          expect(err.message).to.match(/Bad email/)
        })
      })
    })

    describe('build', function () {
      it('should error if insufficient source params', function () {
        util.speedFactor(this, 8)
        const missingEmail = [
          path.resolve('build/src/cli/cli-build.js'),
          'build',
          '-p',
          'the problem is the missing email address',
          '-o',
          context.version.toString()
        ]
        const prog = buildCli.buildProgram()
        return cli.runProgram(
          prog,
          missingEmail,
          buildCli.buildCmd
        )
        .then(() => {
          assert(false, 'should error running program with bad args')
        }, (err) => {
          expect(err.message).to.match(/The `build` command requires either/)
        })
      })

      it('should error if file not found', function () {
        util.speedFactor(this, 8)
        const missingFile = [
          path.resolve('build/src/cli/cli-build.js'),
          'build',
          '-f',
          'not-a-real-file.rpm',
          '-o',
          context.version.toString()
        ]
        const prog = buildCli.buildProgram()
        return cli.runProgram(
          prog,
          missingFile,
          buildCli.buildCmd
        )
        .then(() => {
          assert(false, 'should error running program with bad args')
        }, (err) => {
          expect(err.message).to.match(/File not found/)
        })
      })
    })

    describe('run', function () {
      it('should error if container name not given', function () {
        util.speedFactor(this, 8)
        const missingName = [
          path.resolve('build/src/cli/cli-run.js'),
          'run',
          '-e',
          process.env.MARKLOGIC_DEV_EMAIL!,
          '-p',
          process.env.MARKLOGIC_DEV_PASSWORD!,
          context.version.toString()
        ]
        const prog = runCli.buildProgram()
        return cli.runProgram(
          prog,
          missingName,
          runCli.runCmd
        )
        .then(() => {
          assert(false, 'should error running program with bad args')
        }, (err) => {
          expect(err.message).to.match(/The `run` command requires the `contName` option/)
        })
      })

      it('should call runHost with the expected params', function () {
        util.speedFactor(this, 8)

        const fStub = sandbox.stub(MlDock.prototype, 'runHost').callsFake((options: {
          version: string,
          rpmSource: { email: string, password: string},
          containerName: string,
        }) => Promise.resolve({ id: '' }))

        const okParams = [
          path.resolve('build/src/cli/cli-run.js'),
          'run',
          '-n',
          'mycontainer',
          '-e',
          process.env.MARKLOGIC_DEV_EMAIL!,
          '-p',
          process.env.MARKLOGIC_DEV_PASSWORD!,
          context.version.toString()
        ]
        const prog = runCli.buildProgram()
        return cli.runProgram(
          prog,
          okParams,
          runCli.runCmd
        )
        .then(() => (<any>expect(fStub.firstCall.args)).to.deepNestedInclude({
          containerName: 'myContainer',
          email: process.env.MARKLOGIC_DEV_EMAIL!,
          password: process.env.MARKLOGIC_DEV_PASSWORD!
        }))
        .then(() => fStub.restore())
      })
    })

    describe('error handlers', function () {
      it('process exits on error', function () {
        util.speedFactor(this, 8)
        return spawnCli(['download', '-adsfaf', 'notwork'])
        .then(
          () => assert(false, 'should error on no args'),
          (err) => {}
        )
      })
      it('handles bad command', function () {
        util.speedFactor(this, 8)
        return spawnCli(['notacommand'])
        .then(
          () => assert(false, 'should error on no args'),
          (err) => {}
        )
      })
    })
  })
})
