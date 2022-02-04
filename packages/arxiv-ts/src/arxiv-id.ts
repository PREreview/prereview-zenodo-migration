import * as E from 'fp-ts/Either'
import { flow, pipe } from 'fp-ts/function'
import { extract } from 'identifiers-arxiv'
import * as c from 'io-ts/Codec'
import * as d from 'io-ts/Decoder'
import { UrlD, toString, withBase } from 'url-ts'

export type ArxivId = string & ArxivIdBrand

export const ArxivIdD = pipe(d.string, d.refine(isArxivId, 'ArxivIdD'))

export const ArxivIdC = c.fromDecoder(ArxivIdD)

export const toUrl: (arxivId: ArxivId) => URL = withBase('https://arxiv.org/abs/')

function isArxivId(value: string): value is ArxivId {
  return `arXiv:${extract(value)[0]}` === value
}

interface ArxivIdBrand {
  readonly Arxiv: unique symbol
}
