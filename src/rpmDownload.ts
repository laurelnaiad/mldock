import * as crypto from 'crypto'
import * as path from 'path'
import * as fsx from 'fs-extra'
import { createWriteStream } from 'fs'
import got from 'got'
import * as tough from 'tough-cookie'
const through2 = require('through2')

import { HashMap } from './util'
import {
  MlVersion,
  sha1
} from './version'
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
function getHasher(hash: crypto.Hash) {
  return through2(function (this: any, data: string | Buffer, enc: BufferEncoding, cb: Function) {
    const buffer = Buffer.isBuffer(data) ?
        data :
        new Buffer(data, enc)
    hash.update(buffer)
    this.push(data)
    cb()
  }, function(cb: Function) {
    cb()
  })
}

export function downloadRpm(options: {
  targetDir: string,
  version: MlVersion,
  credentials: DevCreds,
  progressFollower: ProgressFollower
}): Promise<string> {
  const form = {
    email: options.credentials.email,
    password: options.credentials.password,
    asset: options.version.downloadUrl
  }
  options.progressFollower(
    `Downloading version ${options.version.toString()} to ${options.targetDir}  `
  )
  options.progressFollower(undefined, 'Logging in')

  const hash = crypto.createHash('sha1')
  let cookie: tough.Cookie
  return got('https://developer.marklogic.com/login', {
    method: 'post',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    form: form,
    // json: form
  }).then((resp) => {
    /* istanbul ignore next */
    if (resp.statusCode && resp.statusCode > 299) {
      throw new Error(`Got non-success trying to login: ${resp.statusCode}: ${resp.statusMessage}`)
    }
    const bodyObj = JSON.parse(resp.body)
    if (bodyObj.status && bodyObj.status !== 'ok') {
      throw new Error(resp.body)
    }
    cookie = tough.Cookie.parse(resp.headers['set-cookie']![0])!
    options.progressFollower(undefined, 'Getting download uri')
    return new Promise<string>((res, rej) => {
      got('https://developer.marklogic.com/get-download-url', {
        method: 'post',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'cookie': cookie.cookieString()
        },
        form: { download: options.version.downloadUrl },
      })
      .then((resp) => {
        /* istanbul ignore next */
        if (resp.statusCode &&  resp.statusCode > 299) {
          throw new Error(`Got non-success trying to get download url: ${resp.statusMessage}: ${resp.statusMessage}`)
        }
        const uri = JSON.parse(resp.body).path
        const filename = path.join(options.targetDir, options.version.rpmName)
        let progressPercent = 0
        let myTime: Date
        fsx.mkdirpSync(path.dirname(filename))

        const hasher = getHasher(hash)

        const anyGot = <any>got // typings don't match reality on master re the stream function
        anyGot.stream(uri, {
          method: 'post',
          headers: {
            'cookie': cookie.cookieString(),
            'content-type': 'application/json'
          },
          form: { download: options.version.downloadUrl },
        })
        .on('downloadProgress', (state: { percent: number }) => {
          const now = new Date()
          myTime = myTime || new Date()
          let newPercent = Math.round(state.percent * 100)
          if (newPercent > progressPercent) {
            progressPercent = newPercent
            options.progressFollower(undefined, newPercent + '%' )
            myTime = new Date()
          }
          else {
            const diffSecs = (now.valueOf() - myTime.valueOf()) / 1000
            /* istanbul ignore if */ // not likely in an unthrottled environment
            if (diffSecs > notifyFreq) {
              options.progressFollower(undefined, 'this is going slowly... ')
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
        .pipe(hasher).pipe(createWriteStream(filename))
        .on('finish', () => {
          const sha = hash.digest('hex')
          if (
            sha1[options.version.toString()] &&
            sha1[options.version.toString()] !== sha
          ) {
            throw new Error(
              `Checksum failed. Expected ${sha1[options.version.toString()]}, ` +
              ` calculated ${sha}`
            )
          }
          else {
            options.progressFollower(undefined)
            options.progressFollower(
              `Checksum checks. ${sha1[options.version.toString()]}, ${sha}`
            )
          }
          // printing the calculated sha without knowning what it was supposed
          // to be would be pretty cruel
          options.progressFollower(undefined)
          res(filename)
        })
      })
    })
  })
}
