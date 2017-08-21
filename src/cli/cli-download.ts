#!/usr/bin/env node
const { Command } = require('commander')
import {
  cmdDownload,
  handleSuccess,
  handleError
} from './commands'

const program = new Command()
program.parse(process.argv)

cmdDownload(program, process.argv)
.then(handleSuccess, handleError)
