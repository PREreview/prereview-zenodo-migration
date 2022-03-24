import * as R from 'fp-ts/Reader'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { Request } from './request'

export type FetchEnv = {
  fetch: (input: string, init: RequestInit) => Promise<Response>
}

export class NetworkError extends Error {
  name!: 'NetworkError'
}

export const send: (request: Request) => RTE.ReaderTaskEither<FetchEnv, NetworkError, Response> = ([url, init]) =>
  R.asks(TE.tryCatchK(({ fetch }: FetchEnv) => fetch(url.href, init), toNetworkError))

function toNetworkError(error: unknown): NetworkError {
  if (error instanceof NetworkError) {
    return error
  }

  if (error instanceof Error) {
    return new NetworkError(error.message)
  }

  return new NetworkError(String(error))
}
