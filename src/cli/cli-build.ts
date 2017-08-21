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

export  const program = new Command()

export function cmdBuild(version: string, options: {
  repo: string,
  rpmFile?: string,
  email?: string,
  password?: string,
  overwrite?: boolean
}): Promise<string> {
  if (!(options.rpmFile || (options.password && options.email))) {
    return Promise.reject(new Error(
      'The `build` action requires at least the `rpmFile` or `email` and `password` options to be set.'
    ))
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

export function runProgram(args: string[]) {
  program.parse(args)
  if (!program.args[0]) {
    program.outputHelp()
    process.exit(1)
  }
  return cmdBuild(program.args[0], program)
  .then(handleSuccess, handleError)
}

program
.option(...opts.repo)
.option(...opts.rpmFile)
.option(...opts.email)
.option(...opts.password)
.option(...opts.overwriteImage)

if (require.main === module) {
  runProgram(process.argv)
}
