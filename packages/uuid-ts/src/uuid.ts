import { pipe } from 'fp-ts/function'
import * as c from 'io-ts/Codec'
import * as d from 'io-ts/Decoder'
import * as uuid from 'uuid'

export type Uuid = string & UuidBrand

export const UuidD = pipe(d.string, d.refine(isUuid, 'UUID'))

export const UuidC = c.fromDecoder(UuidD)

function isUuid(value: string): value is Uuid {
  return uuid.validate(value)
}

interface UuidBrand {
  readonly Uuid: unique symbol
}
