const logUpdate = require('log-update')

function finishPriorStep(currentStep: { step: string | undefined } ) {
  // since we have step, it's beginning of a new step
  if (currentStep.step) {
    logUpdate(`${currentStep.step}...done.`)
    logUpdate.done()
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
  if (step && message) {
    finishPriorStep(currentStep)
    logUpdate(`${step}...${message}`)
    currentStep.step = step
  }
  else {
    if (step) {
      finishPriorStep(currentStep)
      logUpdate(`${step}...`)
      currentStep.step = step
    }
    else {
      if (message) {
        if (currentStep.step) {
          logUpdate(`${currentStep.step}...${message}`)
        }
        else {
          // technically, this should be done to us by the library, but..
          logUpdate(`...${message}`)
        }
      }
      else {
        finishPriorStep(currentStep)
        currentStep.step = undefined
      }
    }
  }
}
