import { expect, assert } from 'chai'
import * as Docker from 'dockerode'

import * as util from './util.unit'
import {
  DevCreds,
  MlVersion,
  MlDock,
  ContainerRuntimeRef,
  ProgressFollower,
  defaultFollower
} from '../src'

const progressFollower = defaultFollower
const containerName = 'test-mldock-runHost'

function removeRunningHostAndVersionInStages(
  mldock: MlDock,
  ct: Docker.Container,
  version: MlVersion
) {
  return ct.kill()
  .then(() => ct.remove())
  .then(() => mldock.removeVersion(version))
  .then(() => mldock.inspectVersion(version))
  .then(
    (imageInfo) => assert(
      false,
      'Expected to error inspecting an uninstalled version.'
    ),
    (err) => {
      if (err.statusCode !== 404) {
        throw err
      }
    }
  )
}

function testLiveHost(
  mldock: MlDock,
  ct: Docker.Container,
  version: MlVersion
) {
  return mldock.hostInspect(ct.id!)
  .then((ctRuntime) => {
    expect(ctRuntime.ports[8001]).to.be.greaterThan(10000)
  })
}

function testInstall(
  mldock: MlDock,
  rpmSource: string | DevCreds,
  version: MlVersion,
) {
  return mldock.inspectVersion(version)
  .then(
    (imageInfo) => mldock.removeVersion(version),
    (err: any) => {
      if (err.statusCode !== 404) {
        assert(false, 'failed in removeVersion, ' + err.stack)
      }
    }
  )
  .then(() => {
    return mldock.buildVersion({
      version,
      rpmSource,
      overwrite: true,
      baseImage: undefined,
      progressFollower
    })
  })
  .then(() => {}, (err: Error) => assert(false, err.stack))
  .then(() => mldock.inspectVersion(version))
  .then((imageInfo) => {
    assert.ok(imageInfo.Id, 'No Id property on inspected image')
  })
  .then(() => mldock.client.isVersionPresent(version, defaultFollower))
  .then((isPresent) => expect(isPresent).to.be.true)
  .then(() => mldock.buildVersion({
    version,
    rpmSource,
    overwrite: false,
    progressFollower,
  }))
  .then(
    () => assert(false, 'Should error trying to overwrite if not opted in'),
    (err) => {}
  )
  .then(() => util.createBasicHost(mldock, version, containerName, progressFollower))
  .then((ct) => {
    return mldock.startHostHealthy(ct.id!, 30, progressFollower)
    .then((ct) => testLiveHost(mldock, ct, version))
  })
}

module.exports = () =>
describe('MlDock class', function () {
  let mldock: MlDock
  let version: MlVersion

  after(function () {
    util.speedFactor(this, 21)
    return mldock.hostInspect(containerName)
    .then((ctRtRef) => removeRunningHostAndVersionInStages(
      mldock,
      ctRtRef.container,
      version
    ))
  })

  it('tranlates versions to tags', function () {
    const tforF = util.getContext().mldock.getTagForVersion('9.0-1')
    expect(tforF).to.equal(`test-mldock-marklogic:9.0.1`)
  })

  it('downloads and builds MarkLgic image in the docker host', function () {
    util.speedFactor(this, 1597)

    return testInstall(
      util.getContext().mldock,
      {
        email: process.env.MARKLOGIC_DEV_EMAIL!,
        password: process.env.MARKLOGIC_DEV_PASSWORD!,
      },
      util.getContext().version
    )
  })

  describe('runHost', function () {
    before(function () {
      mldock = util.getContext().mldock
      version = util.getContext().version
    })

    // these tests are sequenced, order matters
    it('resolves to the runtime ref of a running host', function () {
      util.speedFactor(this, 55)
      return mldock.runHost({
        containerName,
        version,
      })
      .then((ctRtRef) => {
        expect(ctRtRef.ports[8001]).to.be.ok
        return mldock.removeHost(ctRtRef)
        .then(() => mldock.hostInspect(containerName))
        .then(
          (ctrt) => assert(false),
          (err: any) => expect(err.statusCode).to.equal(404)
        )
      })
    })

    it('can create and run a host from an installed version', function () {
      util.speedFactor(this, 55)
      return mldock.runHost({
        containerName,
        version,
      })
      .then((ctRtRef) => {
        expect(ctRtRef.ports[8001]).to.be.ok
        // set up next test precondition
        return ctRtRef.container.stop()
        .then(() => mldock.hostInspect(containerName))
        .then((ctRtRef) => expect(ctRtRef.ports[8001]).to.be.undefined)
      })
    })

    it('can run a stopped host', function () {
      util.speedFactor(this, 55)
      const { mldock, version } = util.getContext()
      return mldock.runHost({
        containerName,
        version,
      })
      .then((ctRtRef) => expect(ctRtRef.ports[8001]).to.be.ok)
    })
  })
})
