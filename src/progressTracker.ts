const JSONStream = require('JSONStream')

export interface ProgressFollower {
  (step: string | undefined, message?: string | undefined): void
}


/**
 * Massages the stream emitted by dockerode's modem for taking log lines
 * trimmed and one-by-one.
 *
 * Captures the `id` of the entity under processing, if it
 * appears in the log lines as a sha, or if it is emitted in the aux
 * property from the modem.
 *
 * Resolves the promise it returns when the stream ends, rejects it when
 * then stream errors or when an error property appears in an progress event
 * from the modem.
 * @param stream
 * @param onLogLine
 */
export function progressToLogLines(
  stream: NodeJS.ReadableStream,
  onLogLine: (msg: string) => void
): Promise<string> {
  let id: string | undefined
  const myListeners: { evt: string, listener: any }[] = []
  const parser = JSONStream.parse()
  function removeMyListeners() {
    myListeners.forEach(l => parser.removeListener(l.evt, l.listener))
  }
  return new Promise((res, rej) => {
    const rootListener = (evt: any) => {
      /* istanbul ignore if */
      if (evt.error) {
        removeMyListeners()
        if (evt.error instanceof Error) {
          rej(evt.error)
        }
        else {
          rej(new Error(evt.error))
        }
      }
      else {
        const msg = evt.stream
        const aux = evt.aux
        if (msg) {
          msg.trim().split('\n').forEach((line: string) => {
            line = line.trim()
            const matchesSha = line.match(/^sha\:(.*)/)
            if (matchesSha) {
              /**
               * to be tested. this condition was last noted while
               * overwriting an image, if memory serves
               */
              id = matchesSha[1]
            }
          })
          onLogLine(msg)
        }
        else {
          if (evt.aux && evt.aux.ID) {
            id = evt.aux.ID
          }
        }
      }
    }
    /* istanbul ignore next */
    const errorListener = (err: any) => {
      removeMyListeners()
      if (err instanceof Error) {
        rej(err)
      }
      else {
        rej(new Error(err))
      }
    }
    const endListener = (thing1: string, otherthing: string) => {
      removeMyListeners()

      /* istanbul ignore if */
      if (!id) {
        rej(new Error('Build stream ended without an id.'))
      }
      res(id)
    }

    // at some point, docker started using 'data' instead of 'root'. Leaving
    // both in there seems like a good plan for compat.
    myListeners.push({ evt: 'data', listener: rootListener })
    myListeners.push({ evt: 'root', listener: rootListener })
    myListeners.push({ evt: 'error', listener: errorListener })
    myListeners.push({ evt: 'end', listener: endListener })
    parser.on('data', rootListener)
    parser.on('root', rootListener)
    parser.on('error', errorListener)
    parser.on('end', endListener)
    stream.pipe(parser)
  })
}
