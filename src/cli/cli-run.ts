#!/usr/bin/env node
const { Command } = require('commander')
import { cliFollower } from './handlers'
import * as opts from './opts'
import * as cli from './cli'
import {
  MlDock,
  DevCreds,
} from '../index'

export function runCmd(version: string, options: {
  repo: string,
  contName?: string,
  hhTime?: number,
  rpmFile?: string,
  email?: string,
  baseImage?: string,
  password?: string,
}): Promise<string> {
  if (!(options.contName)) {
    return Promise.reject(new Error(
      'The `run` command requires the `contName` option to be set.'
    ))
  }
  const rpmSource = options.rpmFile ? options.rpmFile : <DevCreds>options
  const currentStep = { step: undefined }
  const {
    repo,
    hhTime,
    rpmFile,
    email,
    password,
    contName,
    ...myOpts
  } = options
  const mld = new MlDock({ repo: options.repo })
  return mld.runHost({
    ...myOpts,
    version,
    rpmSource,
    containerName: contName,
    hostHealthyTimeout: hhTime,
    progressFollower: cliFollower.bind(cliFollower, currentStep)
  })
  .then(ctRtRef => ctRtRef.id)
}

export function buildProgram() {
  const program = new Command()
  program
  .option(...opts.repo)
  .option(...opts.containerName)
  .option(...opts.hostHealthyTime)
  .option(...opts.rpmFile)
  .option(...opts.email)
  .option(...opts.password)
  .option(...opts.baseImage)
  return program
}

cli.liftProgram(
  buildProgram,
  runCmd,
  module,
)
