#!/usr/bin/env node
const { Command } = require('commander')
import { cliFollower } from './handlers'
import * as opts from './opts'
import * as cli from './cli'
import {
  MlDock,
  DevCreds,
} from '../index'

export function downloadCmd(version: string, options: {
  dir?: string,
  email?: string,
  password?: string,
  overwrite?: boolean
}): Promise<string> {
  if (!(options.dir && options.password && options.email)) {
    return Promise.reject(new Error(
      'The `download` command requires the `dir`, `email` and `password` options to be set.'
    ))
  }
  const currentStep = { step: undefined }
  const mld = new MlDock()
  const {
    dir,
    email,
    password,
    ...myOpts,
  } = options
  return mld.downloadVersion({
    ...myOpts,
    version,
    credentials: { email: email!, password: password! },
    targetDir: options.dir!,
    progressFollower: cliFollower.bind(cliFollower, currentStep)
  })
}

export function downloadProgram() {
  const program = new Command()
  program
  .option(...opts.downloadDir)
  .option(...opts.email)
  .option(...opts.password)
  .option(...opts.overwriteFile)

  return program
}

cli.liftProgram(
  downloadProgram,
  downloadCmd,
  module,
)
