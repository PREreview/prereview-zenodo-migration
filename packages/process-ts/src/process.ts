import chalk from 'chalk'
import { prepend } from 'fp-ts-std/String'
import * as C from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as IO from 'fp-ts/IO'
import * as IOE from 'fp-ts/IOEither'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { flow, pipe } from 'fp-ts/function'
import * as d from 'io-ts/Decoder'

export const run: (effect: TE.TaskEither<Error, unknown>) => Promise<never> = flow(
  TE.matchE(T.fromIOK(onError), T.fromIOK(onError)),
  finish,
)

function finish(task: T.Task<never>): Promise<never> {
  return task().catch(error => {
    console.error(chalk.bold.red('🚨 Unexpected error'), error)

    process.exit(1)
  })
}

export function readEnvironment<A>(decoder: d.Decoder<NodeJS.ProcessEnv, A>): IOE.IOEither<Error, A> {
  return pipe(
    IOE.rightIO(env),
    IOE.chainEitherK(decoder.decode),
    IOE.mapLeft(flow(d.draw, prepend('Unable to read environment variables:\n'), E.toError)),
  )
}

function onError(error: unknown): IO.IO<never> {
  return pipe(
    error,
    C.error,
    IO.chain(() => exitProcess(1)),
  )
}

function exitProcess(code: number): IO.IO<never> {
  return () => process.exit(code)
}

const env: IO.IO<NodeJS.ProcessEnv> = () => process.env
