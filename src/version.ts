import * as path from 'path'

export class MlVersion {
  major: number
  minor: number
  revision: number
  patch?: number

  constructor(versionStr: string) {
    const regex805Beyond = /^[^\-]+\-(?:[^\d]*\d+)\-(\d+)\.(\d+)\-(\d+)(?:\.(\d))?/
    const regexPre805 = /^[^\-]+-(\d+)\.(\d+)\-(\d+)(?:\.(\d))?/
    const justVersion = /^(?:[^\-\d]+\-)?(\d+)\.(\d+)\-(\d+)(?:\.(\d))?/

    const fname = path.basename(versionStr)
    const matches =
        fname.match(regex805Beyond) ||
        fname.match(regexPre805) ||
        fname.match(justVersion)
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
  }
  get compatibleCentos() {
    return this.major === 8 && this.minor >= 0 && this.revision >= 4 || this.major > 8 ?
        'centos7' :
        'centos6'
  }
  toString() {
    return `${this.major}.${this.minor}-${this.revision}` + (this.patch ? `.${this.patch}` : '')
  }
  toSafeString() {
    return this.toString().replace(/(\.|-)/g, '_')
  }
  toDotString() {
    return this.toString().replace(/(-)/g, '.')
  }
  get downloadUrl(): string {
    const baseUrl = `https://developer.marklogic.com/download/binaries/${this.major}.${this.minor}/MarkLogic`
    if (this.major < 9) {
      if (this.minor < 1) {
        if (this.revision < 5) {
          return `${baseUrl}-${this.toString()}.x86_64.rpm`
        }
        else {
          return `${baseUrl}-RHEL7-${this.toString()}.x86_64.rpm`
        }
      }
      else {
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
