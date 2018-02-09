import * as path from 'path'

import { HashMap } from './util'

export const sha1: HashMap<string> = {
  '8.0-1': 'ffb1168a4691ccce072af0c1dea57de339c5da4a',
  '8.0-1.1': '0849ea6f4d2782186103b6688d1f553f1731d032',
  '8.0-2': '60111da65616957e3e437f8726fcbe16b0ee7ade',
  '8.0-3': 'df7db6139c8de0ea47d22d4f921c309c88e72970',
  '8.0-4': '61f9bcda33a19585c71ed6cc9493c44c819b3cf8',
  '8.0-5': 'd26489a9fef99ddceaa6e5ad70bf49034caa8340',
  '8.0-6': '93d49986b629b7c8ebd79c50885b39378990e387',
  '8.0-6.1': '52f3c69907482f6fc74b82b9e19b19242f70e1f0',
  // '8.0-6.2': undefined,
  '8.0-6.3': 'e8c8f3df984b9fa4fa747b72d1319ac67b5be939',
  '8.0-6.4': 'f0b4eea0f0ba8c4d995e5defd7c349063d4ee656',
  // '8.0-6.5': undefined,
  '8.0-6.6': 'a81101f9e62739505cd43e824bfcc124c4263a66',
  '8.0-6.7': '7396a73a3cbc3d80d41112d98ea9f176cc203ef4',
  '8.0-7': 'de0d21085233450869d44aeec976edb1dac5531e',
  '8.0-8': 'deb04102457f63b6b5d15cee427f94314c4067a6',

  '9.0-1': '01e5a7ce3ee07c9acc98d69a649e8dc317b84740',
  '9.0-2': 'b7142e568178cdd6ab1b742dcb65e0441a32b50c',
  '9.0-3': 'd79f7a746235b3295d6e169fd97bc772919de607',
  '9.0-4': '53ea42c4f427fd45f1f263f351784a540125f959'
}

export class MlVersion {
  major!: number
  minor!: number
  revision!: number
  patch?: number

  constructor(versionStr: string) {
    if (!versionStr) {
      throw new Error('versionStr is required in the MlVersion constructor.')
    }
    const regex805Beyond = /^[^\-]+\-(?:[^\d]*\d+)\-(\d+)\.(\d+)\-(\d+)(?:\.(\d))?/
    const regexPre805 = /^[^\-]+-(\d+)\.(\d+)\-(\d+)(?:\.(\d))?/
    const justVersion = /^(?:[^\-\d]+\-)?(\d+)\.(\d+)\-(\d+)(?:\.(\d))?/

    const fname = path.basename(versionStr)
    const matches =
        fname.match(regex805Beyond) ||
        fname.match(regexPre805) ||
        fname.match(justVersion)

    try {
      const versionParts: string[] = Array.prototype.slice.call(matches, 0)
      versionParts.forEach((p, i) => {
        const intP = parseInt(p)
        switch (i) {
          case 1:
            this.major = intP
            break
          case 2:
            this.minor = intP
            break
          case 3:
            this.revision = intP
            break
          case 4:
            this.patch = intP
            break
        }
      })
      if (!this.revision) {
        throw new Error(
          `Cannot parse version string, did not find a complete version ` +
          `specified: ${versionStr}`
        )
      }
    }
    catch (err) {
      throw new Error(`Cannot parse version string, ${versionStr}. ${err.stack}`)
    }
  }
  get compatibleCentos() {
    return this.major === 8 && this.minor >= 0 && this.revision >= 4 || this.major > 8 ?
        'centos7' :
        'centos6'
  }
  toString() {
    return `${this.major}.${this.minor}-${this.revision}` + (this.patch ? `.${this.patch}` : '')
  }
  toDotString() {
    return this.toString().replace(/(-)/g, '.')
  }
  get downloadUrl(): string {
    const baseUrl = `https://developer.marklogic.com/download/binaries/${this.major}.${this.minor}/MarkLogic`
    if (this.major < 9) {
      /* istanbul ignore else */ // the 8.1 case
      if (this.minor < 1) {
        if (this.revision < 5) {
          return `${baseUrl}-${this.toString()}.x86_64.rpm`
        }
        else {
          return `${baseUrl}-RHEL7-${this.toString()}.x86_64.rpm`
        }
      }
      else {
        // in case there's an 8.1
        return `${baseUrl}-RHEL7-${this.toString()}.x86_64.rpm`
      }
    }
    else {
      return `${baseUrl}-${this.toString()}.x86_64.rpm`
    }
  }
  get rpmName() {
    return this.downloadUrl.match(/([^\/]+)$/)![1]
  }
}
