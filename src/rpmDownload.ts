import * as crypto from 'crypto'
import * as path from 'path'
import * as fsx from 'fs-extra'
import { createWriteStream } from 'fs'
import * as got from 'got'
import * as tough from 'tough-cookie'
const through2 = require('through2')

import { HashMap } from './util'
import { MlVersion } from './version'
import { ProgressFollower } from './progressTracker'

let notifyFreq = 10

export interface DevCreds {
  email: string,
  password: string
}

/*
 * the official shas are only on the web download web page, and only for
 * most recent of each major release, so need to calculate functional shas
 * and maintain a list of known functional, if not the official shas
 */
// function getHasher(hash: crypto.Hash) {
//   return through2(function (this: any, data: string | Buffer, enc: string, cb: Function) {
//     const buffer = Buffer.isBuffer(data) ?
//         data :
//         new Buffer(data, enc)
//     hash.update(buffer)
//     this.push(data)
//     cb()
//   }, function(cb: Function) {
//     cb()
//   })
// }

export function downloadRpm(
  intoDirectory: string,
  versionToDownload: MlVersion,
  mlDevAcctEmail: string,
  mlDevAcctpassword: string,
  progressFollower: ProgressFollower
): Promise<string> {
  const form = {
    email: mlDevAcctEmail,
    password: mlDevAcctpassword,
    asset: versionToDownload.downloadUrl
  }
  progressFollower(`downloading version ${versionToDownload.toString()} to ${intoDirectory}  `)
  progressFollower(undefined, 'logging in')

  const hash = crypto.createHash('sha1')
  let cookie: tough.Cookie
  return got('https://developer.marklogic.com/login', {
    method: 'post',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    form: true,
    body: form
  }).then((resp) => {
    /* istanbul ignore next */
    if (resp.statusCode && resp.statusCode > 299) {
      throw new Error(`Got non-success trying to login: ${resp.statusCode}: ${resp.statusMessage}`)
    }
    const bodyObj = JSON.parse(resp.body)
    if (bodyObj.status && bodyObj.status !== 'ok') {
      throw new Error(resp.body)
    }
    cookie = tough.Cookie.parse(resp.headers['set-cookie'][0])!
    progressFollower(undefined, 'getting download uri')
    return new Promise<string>((res, rej) => {
      got('https://developer.marklogic.com/get-download-url', {
        method: 'post',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'cookie': cookie.cookieString()
        },
        form: true,
        body: { download: versionToDownload.downloadUrl },
      })
      .then((resp) => {
        /* istanbul ignore next */
        if (resp.statusCode &&  resp.statusCode > 299) {
          throw new Error(`Got non-success trying to get download url: ${resp.statusMessage}: ${resp.statusMessage}`)
        }
        const uri = JSON.parse(resp.body).path
        const filename = path.join(intoDirectory, versionToDownload.rpmName)
        let progressPercent = 0
        let myTime: Date
        fsx.mkdirpSync(path.dirname(filename))

        // const hasher = getHasher(hash)
        // got(`https://developer.marklogic.com/download/${versionToDownload.rpmName}.sha1`, {
        //   headers: { 'cookie': cookie.cookieString() },
        // })
        // const declaredSha = shaResp.body

        const anyGot = <any>got // typings don't match reality on master re the stream function
        anyGot.stream(uri, {
          method: 'post',
          headers: {
            'cookie': cookie.cookieString(),
            'content-type': 'application/json'
          },
          form: true,
          body: { download: versionToDownload.downloadUrl },
        })
        .on('downloadProgress', (state: { percent: number }) => {
          const now = new Date()
          myTime = myTime || new Date()
          let newPercent = Math.round(state.percent * 100)
          if (newPercent > progressPercent) {
            progressFollower(undefined, newPercent + '%' )
            myTime = new Date()
          }
          else {
            const diffSecs = (now.valueOf() - myTime.valueOf()) * 1000
            if (diffSecs > notifyFreq) {
              progressFollower(undefined, 'this is going slowly... ')
              if (notifyFreq <= 60) {
                notifyFreq = notifyFreq + 10
              }
              myTime = new Date()
            }
          }
        })
        .on('error',  /* istanbul ignore next */ (err: Error) => {
          rej(new Error(`Errored trying to download the .rpm file: ${err.stack}`))
        })
        .pipe(createWriteStream(filename))
        // .pipe(hasher).pipe(createWriteStream(filename))
        .on('finish', () => {
          const sha = hash.digest('hex')
          // printing the calculated sha without knowning what it was supposed
          // to be would be pretty cruel
          progressFollower(undefined)
          res(filename)
        })
      })
    })
  })
}
