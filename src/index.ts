import 'dotenv/config'
import * as C from 'fp-ts/Console'
import * as IOE from 'fp-ts/IOEither'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import * as l from 'logger-ts'
import nodeFetch from 'node-fetch'
import { readEnvironment, run } from 'process-ts'
import * as d from './decoder'
import { program } from './program'

const EnvD = d.struct({
  ZENODO_API_KEY: d.string,
})

void run(
  pipe(
    readEnvironment(EnvD),
    IOE.map(env => ({
      fetch: nodeFetch as any,
      logger: pipe(C.error, l.withShow(l.showEntry)),
      zenodoApiKey: env.ZENODO_API_KEY,
    })),
    TE.fromIOEither,
    TE.chain(program),
  ),
)
