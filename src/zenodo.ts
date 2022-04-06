import { ArxivIdC } from 'arxiv-ts'
import { Doi, isDoi } from 'doi-ts'
import { FetchEnv, Request, hasStatus, send, setHeader } from 'fetch-fp-ts'
import * as RTE from 'fp-ts/ReaderTaskEither'
import { constant, flow, identity, pipe } from 'fp-ts/function'
import { StatusCodes } from 'http-status-codes'
import { OrcidC } from 'orcid-ts'
import { UrlC, withQuery } from 'url-ts'
import { decode, logError } from './api'
import * as c from './codec'
import * as d from './decoder'
import { NumberFromStringD, PositiveInt, PositiveIntC, PositiveIntD } from './number'

const DoiD = d.fromRefinement(isDoi, 'DOI')
const DoiC = c.fromDecoder(DoiD)

export type ZenodoEnv = {
  zenodoApiKey: string
}

export const ZenodoRecordIdFromDoiD: d.Decoder<Doi, PositiveInt> = {
  decode: doi => {
    const [, id] = doi.match(/^10\.(?:5072|5281|)\/zenodo\.([1-9][0-9]*)$/) ?? []

    return id
      ? pipe(NumberFromStringD, d.compose(PositiveIntD)).decode(id)
      : d.failure(doi, 'a DOI with a Zenodo record ID')
  },
}

const RelationC = c.literal(
  'isCitedBy',
  'cites',
  'isSupplementTo',
  'isSupplementedBy',
  'isContinuedBy',
  'continues',
  'isDescribedBy',
  'describes',
  'hasMetadata',
  'isMetadataFor',
  'isNewVersionOf',
  'isPreviousVersionOf',
  'isPartOf',
  'hasPart',
  'isReferencedBy',
  'references',
  'isDocumentedBy',
  'documents',
  'isCompiledBy',
  'compiles',
  'isVariantFormOf',
  'isOrignialFormOf',
  'isIdenticalTo',
  'isAlternateIdentifier',
  'isReviewedBy',
  'reviews',
  'isDerivedFrom',
  'isSourceOf',
  'requires',
  'isRequiredBy',
  'isObsoletedBy',
  'obsoletes',
  'isPublishedIn',
  'isVersionOf',
)

const RelationResourceTypeC = c.literal('publication-preprint')

const LanguageC = c.literal('eng')

const RelatedIdentifierC = pipe(
  c.sum('scheme')({
    arxiv: c.struct({
      identifier: ArxivIdC,
      scheme: c.literal('arxiv'),
    }),
    doi: c.struct({
      identifier: DoiC,
      scheme: c.literal('doi'),
    }),
    issn: c.struct({
      identifier: c.string,
      scheme: c.literal('issn'),
    }),
    pmid: c.struct({
      identifier: c.string,
      scheme: c.literal('pmid'),
    }),
    url: c.struct({
      identifier: UrlC,
      scheme: c.literal('url'),
    }),
  }),
  c.intersect(
    c.struct({
      relation: RelationC,
      resource_type: c.optional(RelationResourceTypeC),
    }),
  ),
)

const ResourceTypeC = c.sum('type')({
  dataset: c.struct({
    type: c.literal('dataset'),
  }),
  figure: c.struct({
    type: c.literal('figure'),
  }),
  image: c.struct({
    subtype: c.literal('figure', 'plot', 'drawing', 'diagram', 'photo', 'other'),
    type: c.literal('image'),
  }),
  lesson: c.struct({
    type: c.literal('lesson'),
  }),
  other: c.struct({
    type: c.literal('other'),
  }),
  poster: c.struct({
    type: c.literal('poster'),
  }),
  physicalobject: c.struct({
    type: c.literal('physicalobject'),
  }),
  presentation: c.struct({
    type: c.literal('presentation'),
  }),
  publication: c.struct({
    subtype: c.literal(
      'annotationcollection',
      'book',
      'section',
      'conferencepaper',
      'datamanagementplan',
      'article',
      'patent',
      'preprint',
      'deliverable',
      'milestone',
      'proposal',
      'report',
      'softwaredocumentation',
      'taxonomictreatment',
      'technicalnote',
      'thesis',
      'workingpaper',
      'other',
    ),
    type: c.literal('publication'),
  }),
  software: c.struct({
    type: c.literal('software'),
  }),
  video: c.struct({
    type: c.literal('video'),
  }),
})

export const ZenodoRecordC = c.struct({
  conceptdoi: c.optional(DoiC),
  doi: DoiC,
  id: PositiveIntC,
  links: c.struct({
    latest: UrlC,
    latest_html: UrlC,
  }),
  metadata: c.struct({
    access_right: c.literal('open', 'embargoed', 'restricted', 'closed'),
    access_right_category: c.literal('danger', 'success', 'warning'),
    creators: c.readonlyNonEmptyArray(
      c.struct({
        name: c.string,
        orcid: c.optional(OrcidC),
      }),
    ),
    description: c.string,
    language: c.optional(LanguageC),
    license: c.optional(
      c.struct({
        id: c.string,
      }),
    ),
    related_identifiers: c.optional(c.readonlyNonEmptyArray(RelatedIdentifierC)),
    resource_type: ResourceTypeC,
    title: c.string,
  }),
})

const ZenodoRecordsC = c.struct({
  hits: c.struct({
    hits: c.readonlyArray(ZenodoRecordC),
  }),
})

export type ZenodoRecord = c.TypeOf<typeof ZenodoRecordC>

const fetchFromZenodo = (request: Request) =>
  pipe(
    RTE.ask<FetchEnv & ZenodoEnv>(),
    RTE.map(({ zenodoApiKey }) => pipe(request, setHeader('Authorization', `Bearer ${zenodoApiKey}`))),
    RTE.chainW(send),
  )

const recordUrl = (id: PositiveInt) => new URL(id.toString(), 'https://zenodo.org/api/records/') // https://sandbox.zenodo.org/api/records/

const fetchRecord = flow(
  recordUrl,
  Request('GET'),
  fetchFromZenodo,
  RTE.filterOrElseW(hasStatus(StatusCodes.OK), identity),
  RTE.orElseFirstW(logError('Unable to fetch record from Zenodo')),
)

const decodeRecord = decode(ZenodoRecordC, 'Unable to decode record from Zenodo')
const decodeRecords = decode(ZenodoRecordsC, 'Unable to decode records from Zenodo')

export const getRecord = flow(
  fetchRecord,
  RTE.chainW(decodeRecord),
  RTE.mapLeft(constant(new Error('Unable to read from Zenodo'))),
)

export const search = flow(
  withQuery(`https://zenodo.org/api/records/`),
  Request('GET'),
  fetchFromZenodo,
  RTE.filterOrElseW(hasStatus(StatusCodes.OK), identity),
  RTE.orElseFirstW(logError('Unable to search Zenodo')),
  RTE.chainW(decodeRecords),
  RTE.bimap(constant(new Error('Unable to read from Zenodo')), results => results.hits.hits),
)
