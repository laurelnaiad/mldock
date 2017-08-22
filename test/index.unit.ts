const dotenv = require('dotenv')
import * as util from './util.unit'
import {
  MlVersion,
  MlDock,
  ContainerRuntimeRef,
  defaultFollower
} from '../src'

export {}

const defaultTestVersion = '8.0-6.4'
let myLibs: any[] = [
  './mldockClass.unit',
  './mldockCli.unit',
]
myLibs.forEach((lib, i) => (myLibs[i] = require(lib)))

/**
 * Trouble ensues on travis if a download is attempted while there's
 * already an installed version. Steps need to remove their
 * version to make room for subsequent installs, or they
 * need to continue with existing version
 */
describe('mldock package', function () {
  let mld: MlDock
  let version: MlVersion
  let containerName: string
  let ctRt: ContainerRuntimeRef

  before(function () {
    if (!process.env.MARKLOGIC_DEV_EMAIL) {
      dotenv.config({ path: 'ci/build_args' })
      if (!process.env.MARKLOGIC_VERSION) {
        process.env.MARKLOGIC_VERSION = defaultTestVersion
      }
    }
    if (!process.env.MARKLOGIC_DEV_EMAIL) {
      throw new Error(
        `To run tests, the MARKLOGIC_DEV_EMAIL and MARKLOGIC_DEV_PASSWORD ` +
        `environment variables must be set. Create <repo>/ci/build_args using ` +
        `the example in the directory as a guide.`
      )
    }
    util.speedFactor(this, 34)
    return util.getContext().mldock.removeAll(defaultFollower)
  })

  myLibs.forEach(lib => lib())

  after(function () {
    const mld = util.getContext().mldock
    util.speedFactor(this, 34)
    return mld.removeVersion(version, defaultFollower)
  })
})
