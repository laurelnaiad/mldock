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
  '9.0-4': '53ea42c4f427fd45f1f263f351784a540125f959',
  '9.0-5': '57e8572e0b9fd94e7e3eff8d436cd6a98689a05c',
  '9.0-5.1': 'aaf04ed25b9ebff5ca9225ea1c7af633db026f23',
  '9.0-6': '2d27d91bfec7af58876d7554760d2154079c0269',
  '9.0-6.1': '82b568c94c9dfc706347a60f75740bd7d9288009',
  '9.0-6.2': '83cf2651f381f05fa3adcb6a1e5350e2f73901a6',
  '9.0-7': '4d83aeb932fb7c02e5a2f10482d827821bb2ea6e',
  '9.0-8': 'b7179468e2b65e448a148a4ceadfe6990fc027ea',
  '9.0-8.1': '0a1511b9a6ea97e60463cea75bf3a7fe7037ad9b',
  '9.0-8.2': '101dd44d99c2cc4fb48826ac3d81d5a0d9b5595b',
  '9.0-9': '8ed7018d836dc7874faa994e632a293ddc6652d2',
  '9.0-9.1': 'ed0c2f737379dffcb7220682138faaa4b4d9c4be',
  '9.0-10': 'a01cbb3eae26e752d2b89cf7a78609796ea55c52',
  // '9.0-10.1': undefined,
  '9.0-10.2': '3323505314ed31ef00eed838074ca1ea127e6f0d',
  '9.0-10.3': 'feaba45a4e2911c633012b5639f7d676498cf954',
  '9.0-10.4': 'f326db1182e1a8627ab39dcdc34f664a34ca280c',
  '10.0-1': 'dafd37dfb74995e46c1455314c29245b3f0fbae6',
  // Starting with MarkLogic Server version 10.0-2, RHEL 8 supported (https://docs.marklogic.com/guide/installation/intro#id_32669)
  '10.0-2': '49354304aa5002e5df9c45dd6f4f72b7dd1834c0',
  '10.0-2.1': 'a93546b24854e9cd6cceb5a49c830bc54a756230',
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
    if (
      this.major > 10 ||
      (
          this.major === 10 &&
          (this.minor > 0 || (this.minor == 0 && this.revision >= 2))
      )
    ) {
      return 'centos8'
    }
    else if (
      this.major > 8 ||
      (
          this.major === 8 &&
          (this.minor > 0 || (this.minor == 0 && this.revision >= 4))
      )
    ) {
      return 'centos7'
    }
    else {
      return 'centos6'
    }
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
