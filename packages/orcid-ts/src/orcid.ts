import { pipe } from 'fp-ts/function'
import * as c from 'io-ts/Codec'
import * as d from 'io-ts/Decoder'
import { toDashFormat } from 'orcid-utils'

export type Orcid = string & OrcidBrand

export const OrcidD = pipe(d.string, d.refine(isOrcid, 'OrcidD'))

export const OrcidC = c.fromDecoder(OrcidD)

function isOrcid(value: string): value is Orcid {
  try {
    return toDashFormat(value) === value
  } catch {
    return false
  }
}

interface OrcidBrand {
  readonly Orcid: unique symbol
}
