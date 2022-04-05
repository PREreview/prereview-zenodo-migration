import { ArxivIdD } from 'arxiv-ts'
import { DoiD } from 'doi-ts'
import { Request, hasStatus, send } from 'fetch-fp-ts'
import * as RTE from 'fp-ts/ReaderTaskEither'
import { constant, flow, identity, pipe } from 'fp-ts/function'
import { StatusCodes } from 'http-status-codes'
import { OrcidD } from 'orcid-ts'
import { Uuid, isUuid } from 'uuid-ts'
import { decode, logError } from './api'
import * as D from './decoder'

const UuidD = pipe(D.string, D.refine(isUuid, 'Uuid'))

/*const sandboxDois = {
  '10.5281/zenodo.5933728': '10.5072/zenodo.1005912' as Doi,
}

const sandboxDoiRewrite = D.parse((doi: Doi) =>
  D.success(doi in sandboxDois ? sandboxDois[doi as keyof typeof sandboxDois] : doi),
)*/

const HandleD = pipe(
  D.string,
  D.parse((handle: string) => {
    const [, scheme, identifier] = handle.match(/^(.+?):(.+)$/) ?? []

    return D.success({ scheme, identifier })
  }),
  D.compose(
    D.sum('scheme')({
      arxiv: D.struct({
        identifier: pipe(
          D.string,
          D.parse(id => D.success(`arXiv:${id}`)),
          D.compose(ArxivIdD),
        ),
        scheme: D.literal('arxiv'),
      }),
      doi: D.struct({
        identifier: DoiD,
        scheme: D.literal('doi'),
      }),
    }),
  ),
)

const FullReviewD = D.struct({
  authors: D.readonlyArray(
    D.struct({
      uuid: UuidD,
    }),
  ),
  doi: D.nullable(DoiD) /*pipe(DoiD , sandboxDoiRewrite),*/,
  drafts: D.readonlyNonEmptyArray(
    D.struct({
      contents: D.string,
    }),
  ),
  preprint: D.struct({
    handle: HandleD,
    title: D.string,
  }),
  updatedAt: D.isoDateString,
  uuid: UuidD,
})

const PersonaD = D.struct({
  isAnonymous: D.boolean,
  name: D.string,
  orcid: D.optional(OrcidD),
})

export type FullReview = D.TypeOf<typeof FullReviewD>

const FullReviewsD = D.struct({
  data: D.readonlyArray(FullReviewD),
})
const PersonasD = D.struct({
  data: D.readonlyArray(PersonaD),
})

const decodeFullReviews = decode(FullReviewsD, 'Unable to decode full reviews from PREreview')
const decodePersonas = decode(PersonasD, 'Unable to decode personas from PREreview')

const fetchFullReviews = pipe(
  new URL(`https://www.prereview.org/api/v2/full-reviews?is_published=true`),
  Request('GET'),
  send,
  RTE.filterOrElseW(hasStatus(StatusCodes.OK), identity),
  RTE.orElseFirstW(logError('Unable to fetch record from Zenodo')),
)

export const getFullReviews = pipe(
  fetchFullReviews,
  RTE.chainW(decodeFullReviews),
  RTE.bimap(constant(new Error('Unable to read from PREreview')), reviews => reviews.data),
)

const fetchPersona = flow(
  (uuid: Uuid) => new URL(uuid, 'https://www.prereview.org/api/v2/personas/'),
  Request('GET'),
  send,
  RTE.filterOrElseW(hasStatus(StatusCodes.OK), identity),
  RTE.orElseFirstW(logError('Unable to fetch persona from Zenodo')),
)

export const getPersona = flow(
  fetchPersona,
  RTE.chainW(decodePersonas),
  RTE.bimap(constant(new Error('Unable to read from PREreview')), personas => personas.data[0]),
)
