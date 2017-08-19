#!/usr/bin/env node
import * as path from 'path'
import * as fsx from 'fs-extra'
const program = require('commander')
const chalk = require('chalk')
import '../util'

function getVersion() {
  const p = path.join(process.cwd(), 'package.json')
  if (fsx.existsSync(p)) {
    return require(p).version
  }
  else {
    return '0.0.0'
  }
}

program
.name('mldock')
.description(`Manage docker-based MarkLogic environments. npmjs.com/package/mldock`)
.version(getVersion())

.command(
  'download <version> <directory>',
  `download the specified MarkLogic Server version into the specified directory.`,
).alias('d')

.command(
  'build <version>',
  `build the specified MarkLogic Server version.`
).alias('i')

program.parse(process.argv)
