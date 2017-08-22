export type HashMap<T> = { [key: string]: T }

export function repeatUntilEmpty<R>(
  iteratee: R[],
  f: (item: R) => Promise<any>
): Promise<R[]> {
  const results: R[] = []
  return new Promise((res, rej) => {
    const loop = () => {
      if (iteratee.length) {
        f(iteratee.shift()!)
        .then(
          (res) => loop(),
          /* istanbul ignore next */
          (err: Error) => rej(err)
        )
      }
      else {
        res()
      }
    }
    loop()
  })
}
