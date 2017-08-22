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

function testLiveHostAndRemoveSafely(
  mldock: MlDock,
  ct: Docker.Container,
  version: MlVersion
) {
  return mldock.hostInspect(ct.id!)
  .then((ctRuntime) => {
    expect(parseInt(ctRuntime.ports[8001])).to.be.greaterThan(10000)

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
  })
}

function testInstall(
  mldock: MlDock,
  source: string | DevCreds,
  version: MlVersion,
) {
  return mldock.inspectVersion(version)
  .then((imageInfo) => {
    return mldock.removeVersion(version)
  }, (err: any) => {
    if (err.statusCode !== 404) {
      throw err
    }
    assert(true)
  })
  .then(() => mldock.buildVersion(
    version,
    source,
    true,
    defaultFollower,
  ))
  .catch((err: Error) => assert(false, err.stack))
  .then(() => mldock.inspectVersion(version))
  .then((imageInfo) => {
    assert.ok(imageInfo.Id, 'No Id property on inspected image')
  })
  .then(() => mldock.client.isVersionPresent(version, defaultFollower))
  .then((isPresent) => expect(isPresent).to.be.true)
  .then(() => mldock.buildVersion(
    version,
    source,
    false, // <= don't overwrite
    defaultFollower,
  ))
  .then(
    () => assert(false, 'Should error trying to overwrite if not opted in'),
    (err) => {}
  )
  .then(() => util.createBasicHost(mldock, version, defaultFollower))
  .then((ct) => {
    return mldock.startHostHealthy(ct.id!, 30, defaultFollower)
    .then((ct) => testLiveHostAndRemoveSafely(mldock, ct, version))
  })
}

module.exports = () =>
describe('MlDock class', function () {
  it('tranlates versions to tags', function () {
    const tforF = util.getContext().mldock.getTagForVersion('9.0-1')
    expect(tforF).to.equal(`test-mldock-marklogic:9.0.1`)
  })

  it('download and builds MarkLgic image in the docker host', function () {
    util.speedFactor(this, 987)

    return testInstall(
      util.getContext().mldock,
      {
        email: process.env.MARKLOGIC_DEV_EMAIL!,
        password: process.env.MARKLOGIC_DEV_PASSWORD!,
      },
      util.getContext().version
    )
  })

  after(function () {
    util.speedFactor(this, 8)
    const ctx = util.getContext()
    return ctx.mldock.removeVersion(ctx.version, defaultFollower)
    // this is a breather in a nod to a struggling laptop
    .then(() => new Promise((res) => setTimeout(() => res(), 2000)))
  })
})
