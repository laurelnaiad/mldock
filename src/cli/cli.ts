#!/usr/bin/env node
import * as path from 'path'
import * as fsx from 'fs-extra'
const { Command } = require('commander')
const chalk = require('chalk')

import { handleNoCommand } from './handlers'

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

program.parse(process.argv)
handleNoCommand(program)
