#!/usr/bin/env node
const { Command } = require('commander')
import {
  cmdBuild,
  handleSuccess,
  handleError
} from './commands'

const program = new Command()
program.parse(process.argv)

cmdBuild(program, process.argv)
.then(handleSuccess, handleError)
