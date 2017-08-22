import * as path from 'path'
import * as fsx from 'fs-extra'
const chalk = require('chalk')
const logUpdate = require('log-update')

import {
  MlDock,
  DevCreds,
  ContainerRuntimeRef
} from '../index'
import * as opts from './opts'
import * as util from '../util'


export function handleSuccess(result: any) {
  console.log(`\n${result.toString().trim()}`)
  process.exit()
}

export function handleError(err: Error | string | number) {
  if (typeof err === 'string') {
    console.log(chalk.red(`\nError: ${err}`))
    process.exit(1)
  }
  else {
    if (typeof err === 'number') {
      console.log(chalk.red(`\nExit code: ${err.toString()}`))
      process.exit(err)
    }
    else {
      const errStack: string = <string>err.stack
      const errLines = errStack.split('\n')
      console.log(chalk.red(`${errLines[0] + '\n' + errLines.slice(1).join('\n')}`))
      process.exit(1)
    }
  }
}

function finishPriorStep(currentStep: { step: string | undefined } ) {
  // since we have step, it's beginning of a new step
  if (currentStep.step) {
    logUpdate(`${currentStep.step}...done.`)
    logUpdate.done()
  }
}

export function handleNoCommand(program: any) {
  if (!program.runningCommand) {
    if (program.args.length) {
      console.log(chalk.red('No such command: ' + program.args[0]))
    }
    program.outputHelp()
    process.exit(1)
  }
}

/**
 * Returns the name of the new step if it finds a step change in the progress.
 * Otherwise, returns undefined.
 */
export function cliFollower(
  currentStep: { step: string | undefined },
  step: string | undefined,
  message?: string | undefined
): void {
  if (message) {
    // use the first line with text
    message = message.trim().split('\n')[0]
  }
  if (step) {
    finishPriorStep(currentStep)
    logUpdate(`${step}...${message || ''}`)
    currentStep.step = step
  }
  else {
    if (message) {
      if (currentStep.step) {
        logUpdate(`${currentStep.step}...${message}`)
      }
      else {
        // technically, this should not be done to us by the library, but..
        /* istanbul ignore next */
        logUpdate(`...${message}`)
      }
    }
    else {
      finishPriorStep(currentStep)
      currentStep.step = undefined
    }
  }
}
