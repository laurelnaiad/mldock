import { expect, assert } from 'chai'
const getPort = require('get-port')
const ip = require('ip')
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
  .then(() => util.createBasicHost(mldock, version, defaultFollower))
  .then((ct) => {
    return mldock.startHostHealthy(ct.id!, 30, defaultFollower)
    .then(
      (resp) => {
        return ct.kill()
        .then(() => ct.remove())
        .then(() => mldock.removeVersion(version))
        .then(() => mldock.inspectVersion(version))
        .then(
          (imageInfo) => assert(false, 'Expected to error inspecting an uninstalled version.'),
          (err) => {
            if (err.statusCode !== 404) {
              throw err
            }
          }
        )
        .then(() => assert(true))
      },
      (err) => assert(false, err.stack)
    )
  })
}

module.exports = () =>
describe('MlDock class', function () {
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
    // this is a breather in a nod to a struggling laptop
    util.speedFactor(this, 8)
    return new Promise((res) => setTimeout(() => res(), 2000))
  })
})
