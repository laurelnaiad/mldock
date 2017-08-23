#!/usr/bin/env node
const { Command } = require('commander')
import { cliFollower } from './handlers'
import * as opts from './opts'
import * as cli from './cli'
import {
  MlDock,
  DevCreds,
} from '../index'

export function buildCmd(version: string, options: {
  repo: string,
  rpmFile?: string,
  email?: string,
  baseImage?: string,
  password?: string,
  overwrite?: boolean
}): Promise<string> {
  if (
    !(options.rpmFile || (options.password && options.email)) ||
    options.rpmFile && (options.password || options.email)
  ) {
    return Promise.reject(new Error(
      'The `build` action requires either the `rpmFile` or the `email` and `password` options to be set.'
    ))
  }
  const rpmSource = options.rpmFile ? options.rpmFile : <DevCreds>options
  const currentStep = { step: undefined }
  const mld = new MlDock({ repo: options.repo })
  return mld.buildVersion({
    version,
    rpmSource,
    overwrite: options.overwrite,
    baseImage: options.baseImage,
    progressFollower: cliFollower.bind(cliFollower, currentStep)
  })
}

export function buildProgram() {
  const program = new Command()
  program
  .option(...opts.repo)
  .option(...opts.rpmFile)
  .option(...opts.email)
  .option(...opts.baseImage)
  .option(...opts.password)
  .option(...opts.overwriteImage)

  return program
}

cli.liftProgram(
  buildProgram,
  buildCmd,
  module,
)
