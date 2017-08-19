#!/usr/bin/env node
import {
  cmdBuild,
  handleSuccess,
  handleError
 } from './commands'

cmdBuild(process.argv)
.then(handleSuccess, handleError)
