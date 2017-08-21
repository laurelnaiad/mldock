import * as path from 'path'
import * as fsx from 'fs-extra'
const chalk = require('chalk')

import {
  MlDock,
  DevCreds,
  ContainerRuntimeRef
} from '../index'
import { cliFollower } from './progressFollower'
import * as opts from './opts'
import * as util from '../util'

function doDownload(program: any, version: string, options: {
  dir?: string,
  email?: string,
  password?: string,
  overwrite?: boolean
}) {
  if (!(options.dir && options.password && options.email)) {
    console.log(chalk.red(
      '\nThe `download` action requires the `dir`, `email` and `password` options to be set.)\n\n'
    ))
    program.outputHelp()
    process.exit(1)
  }
  const source = <DevCreds>options
  const currentStep = { step: undefined }
  const mld = new MlDock()
  return mld.downloadVersion(
    version,
    options.dir!,
    source,
    options.overwrite,
    cliFollower.bind(cliFollower, currentStep)
  )
}

function doBuild(program: any, version: string, options: {
  repo: string,
  rpmFile?: string,
  email?: string,
  password?: string,
  overwrite?: boolean
}) {
  if (!(options.rpmFile || (options.password && options.email))) {
    console.log(chalk.red(
      '\nThe `install` action requires at least the `rpmFile` or `email` and `password` options to be set.)\n\n'
    ))
    program.outputHelp()
    process.exit(1)
  }
  const source = options.rpmFile ? options.rpmFile : <DevCreds>options
  const currentStep = { step: undefined }
  const mld = new MlDock({ repo: options.repo })
  return mld.buildVersion(
    version,
    source,
    options.overwrite,
    cliFollower.bind(cliFollower, currentStep)
  )
}

export function cmdDownload(program: any, argv: string[]): Promise<string> {
  return new Promise((res, rej) => {
    program
    .option(...opts.downloadDir)
    .option(...opts.email)
    .option(...opts.password)
    .option(...opts.overwriteFile)
    .action((...args: any[]) => {
      doDownload.apply(doDownload, [ program, ...args])
      .then(res, rej)
    })
    .parse(argv)
  })
}

export function cmdBuild(program: any, argv: string[]): Promise<string> {
  return new Promise((res, rej) => {
    program
    .option(...opts.repo)
    .option(...opts.rpmFile)
    .option(...opts.email)
    .option(...opts.password)
    .option(...opts.overwriteImage)
    .action((...args: any[]) => {
      doBuild.apply(doBuild, [ program, ...args ])
      .then(res, rej)
    })
    .parse(argv)
  })
}

export function handleSuccess(result?: any) {
  if (result) {
    console.log(`\n${result.toString().trim()}`)
  }
  else {
    console.log(``)
  }
  process.exit()
}

export function handleError(err: Error | string | number) {
  if (typeof err === 'string') {
    console.log(`\nError: ${err}`)
    process.exit(1)
  }
  else {
    if (typeof err === 'number') {
      console.log(`\nExit code: ${err.toString()}`)
      process.exit(err)
    }
    else {
      console.log(`\n${err.stack}`)
      process.exit(1)
    }
  }
}
