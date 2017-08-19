import * as path from 'path'
import * as fsx from 'fs-extra'
import { createWriteStream } from 'fs'
import { EventEmitter } from 'events'
import * as request from 'request'
const progress = require('request-progress')

import { MlVersion } from './version'
import { ProgressFollower } from './progressTracker'

export interface DevCreds {
  email: string,
  password: string
}

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
  progressFollower(`downloading version ${versionToDownload.toString()} to ${intoDirectory}`)
  return new Promise((resolveDownloaded, reject) => {
    const jar = request.jar()
    progressFollower(undefined, 'logging in')
    request.post({
      uri: 'https://developer.marklogic.com/login',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      form,
      jar
    }, (err, reqRes, body) => {
      if (err) {
        return reject(err)
      }
      if (reqRes && reqRes.statusCode && reqRes.statusCode > 299) {
        return reject(new Error(`Got non-success trying to login: ${reqRes.statusMessage}: ${reqRes.statusMessage}`))
      }
      progressFollower(undefined, 'getting download uri')
      request.post({
        uri: 'https://developer.marklogic.com/get-download-url',
        headers: { 'Content-type': 'application/x-www-form-urlencoded' },
        form: { download: versionToDownload.downloadUrl },
        jar
      }, (err, reqRes, body) => {
        if (err) {
          return reject(err)
        }
        if (reqRes && reqRes.statusCode && reqRes.statusCode > 299) {
          return reject(new Error(`Got non-success trying to get download url: ${reqRes.statusMessage}: ${reqRes.statusMessage}`))
        }
        const uri = JSON.parse(body).path
        const filename = path.join(intoDirectory, versionToDownload.rpmName)
        fsx.mkdirpSync(path.dirname(filename))
        const downloading = progress(request({ uri, jar }))
        .on('progress', (state: { percent: number }) => {
          progressFollower(undefined, Math.round(state.percent * 100) + '%' )
        })
        .on('error', (err: Error) => reject(
          new Error(`Errored trying to download the .rpm file: ${err.stack}`)
        ))
        .on('end', () => {
          progressFollower(undefined)
          resolveDownloaded(filename)
        })
        .pipe(createWriteStream(filename))
      })
    })
  })
}
