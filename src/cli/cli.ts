#!/usr/bin/env node
import * as path from 'path'
import * as fsx from 'fs-extra'
const { Command } = require('commander')
const chalk = require('chalk')

import * as handlers from './handlers'

export function runProgram(
  program: any,
  args: string[],
  commandFunc: (cmdName: string, program: any) => Promise<string>
) {
  program.parse(args)

  if (!program.args[0]) {
    program.outputHelp()
    process.exit(1)
  }
  return commandFunc(program.args[0], program)
  .then(handlers.handleSuccess, handlers.handleError)
}

export function liftProgram(
  programDefinition: () => void,
  commandFunc: (cmdName: string, program: any) => Promise<string>,
  inModule?: NodeModule,
) {
  if (require.main === inModule) {
    const program = programDefinition()
    runProgram(program, process.argv, commandFunc)
  }
}

function getVersion() {
  const p = path.resolve(__dirname, '../package.json')
  /* istanbul ignore if */
  if (fsx.existsSync(p)) {
    return require(p).version
  }
  else {
    return '<source>'
  }
}

function mldockProgram() {
  const program = new Command()
  program
  .name('mldock')
  .description(`Dowload MarkLogic .rpms, build containerized MarkLogic images. npmjs.com/package/mldock`)
  .version(getVersion())

  .command(
    'download <version> <directory>',
    `download the specified MarkLogic Server version into the specified directory.`,
  ).alias('d')

  .command(
    'build <version>',
    `build the specified MarkLogic Server version.`
  ).alias('b')

  return program
}

if (require.main === module) {
  const program = mldockProgram()
  program.parse(process.argv)
  handlers.handleNoCommand(program)
}
