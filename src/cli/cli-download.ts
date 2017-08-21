#!/usr/bin/env node
const { Command } = require('commander')
const chalk = require('chalk')
import {
  handleSuccess,
  handleError,
  cliFollower,
} from './handlers'
import * as opts from './opts'
import {
  MlDock,
  DevCreds,
} from '../index'

export const program = new Command()

export function cmdDownload(version: string, options: {
  dir?: string,
  email?: string,
  password?: string,
  overwrite?: boolean
}): Promise<string> {
  if (!(options.dir && options.password && options.email)) {
    return Promise.reject(new Error(
      'The `download` action requires the `dir`, `email` and `password` options to be set.'
    ))
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

export function runProgram(args: string[]) {
  program.parse(args)

  if (!program.args[0]) {
    program.outputHelp()
    process.exit(1)
  }
  return cmdDownload(program.args[0], program)
  .then(handleSuccess, handleError)
}

program
.option(...opts.downloadDir)
.option(...opts.email)
.option(...opts.password)
.option(...opts.overwriteFile)

if (require.main === module) {
  runProgram(process.argv)
}
