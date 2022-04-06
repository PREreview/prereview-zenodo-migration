import { pipe } from 'fp-ts/function'
import { extract } from 'identifiers-arxiv'
import * as c from 'io-ts/Codec'
import * as d from 'io-ts/Decoder'

export type ArxivId = string & ArxivIdBrand

export const ArxivIdD = pipe(d.string, d.refine(isArxivId, 'ArxivIdD'))

export const ArxivIdC = c.fromDecoder(ArxivIdD)

function isArxivId(value: string): value is ArxivId {
  return `arXiv:${extract(value)[0]}` === value
}

interface ArxivIdBrand {
  readonly Arxiv: unique symbol
}
