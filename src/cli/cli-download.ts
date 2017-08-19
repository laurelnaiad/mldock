#!/usr/bin/env node
import {
  cmdDownload,
  handleSuccess,
  handleError
 } from './commands'

cmdDownload(process.argv)
.then(handleSuccess, handleError)
