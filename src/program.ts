import { createTwoFilesPatch, parsePatch } from 'diff'
import * as IOO from 'fp-ts-contrib/IOOption'
import * as RTEC from 'fp-ts-contrib/ReaderTaskEither'
import { replaceAll } from 'fp-ts-std/String'
import * as C from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as RA from 'fp-ts/ReadonlyArray'
import * as RNEA from 'fp-ts/ReadonlyNonEmptyArray'
import * as b from 'fp-ts/boolean'
import { constant, flow, pipe } from 'fp-ts/function'
import * as s from 'fp-ts/string'
import * as l from 'logger-fp-ts'
import { logError } from './api'
import { FullReview, getFullReviews, getPersona } from './prereview'
import { ZenodoRecord, ZenodoRecordC, ZenodoRecordIdFromDoiD, getRecord } from './zenodo'

const skippedReviews = [
  '60543989-3455-4f1a-bc83-8cc8d7f60cfa', // fake
  'a4de695e-afb0-46fe-8d13-35fe606f03d2', // fake
  'cd61075a-3d98-42e2-a35c-19a0ba761d98', // fake
  'c249632e-501f-4e40-9445-430b155499da', // fake
  '39731b20-f8a7-47ee-a633-7aa7fa22dc95', // fake
  'b7fec0fc-0721-4c55-b029-224db1630802', // fake
  'f2dbaf8d-1d2a-478e-8513-f7b701cd4b3d', // fake
]

const getRecordIdFromDoi = flow(
  RTE.fromEitherK(ZenodoRecordIdFromDoiD.decode),
  RTE.orElseFirstW(logError('Unable to turn DOI into Zenodo record ID')),
  RTE.mapLeft(constant(new Error('Unable to turn DOI into Zenodo record ID'))),
)

function getRecordId(review: FullReview) {
  return pipe(
    review.doi,
    RTE.fromEitherK(E.fromNullable(new Error('No DOI'))),
    RTE.orElseFirstW(
      RTEC.fromReaderIOK(() =>
        pipe(
          {
            preprintId: review.preprint.handle.identifier,
            reviewId: review.uuid,
          },
          l.warnP('No DOI'),
        ),
      ),
    ),
    RTE.matchE(() => RTE.right(O.none), flow(getRecordIdFromDoi, RTE.map(O.some))),
  )
}

function createExpectedRecord(review: FullReview, existing: ZenodoRecord) {
  return pipe(
    review.authors,
    RTE.traverseReadonlyArrayWithIndexSeq((_, author) => pipe(author.uuid, getPersona)),
    RTE.map(
      (authors): ZenodoRecord => ({
        ...existing,
        metadata: {
          ...existing.metadata,
          access_right: 'open',
          access_right_category: 'success',
          creators: pipe(
            authors,
            RA.match(
              () => [{ name: 'PREreview.org community member', orcid: O.none }],
              RNEA.map(author => ({
                name: author.isAnonymous ? 'PREreview.org community member' : author.name,
                orcid: author.orcid,
              })),
            ),
          ),
          // description: review.drafts[0].contents,
          language: O.some('eng'),
          license: O.some({
            id: 'CC-BY-4.0',
          }),
          related_identifiers: pipe(
            existing.conceptdoi,
            O.map(conceptdoi => [
              {
                ...review.preprint.handle,
                relation: 'reviews',
                resource_type: O.some('publication-preprint'),
              },
              {
                scheme: 'doi',
                identifier: conceptdoi,
                relation: 'isVersionOf',
                resource_type: O.none,
              },
            ]),
          ),
          resource_type: {
            subtype: 'article',
            type: 'publication',
          },
          title: `Review of ${pipe(review.preprint.title, replaceAll('’')("'"))}`,
        },
      }),
    ),
  )
}

function processFullReview(review: FullReview) {
  return pipe(
    review,
    getRecordId,
    RTE.chain(O.fold(() => RTE.right(O.none), flow(getRecord, RTE.map(O.some)))),
    RTE.chainW(
      O.fold(
        () =>
          pipe(
            RTE.right(O.some(review.uuid)),
            RTEC.chainFirstReaderIOKW(() =>
              pipe(
                {
                  preprintId: review.preprint.handle.identifier,
                  reviewId: review.uuid,
                  changesNeeded: true,
                },
                l.warnP('Skipped processing full review'),
              ),
            ),
          ),
        record =>
          pipe(
            createExpectedRecord(review, record),
            RTE.chainIOK(
              flow(
                expectedRecord =>
                  createTwoFilesPatch(
                    record.links.latest.href,
                    `https://www.prereview.org/api/v2/full-reviews/${review.uuid}`,
                    JSON.stringify(ZenodoRecordC.encode(record), null, 2) + '\n',
                    JSON.stringify(ZenodoRecordC.encode(expectedRecord), null, 2) + '\n',
                  ),
                IOO.fromPredicate(flow(parsePatch, patch => patch[0].hunks.length > 0)),
                IOO.chainFirstIOK(C.log),
                IOO.map(() => review.uuid),
              ),
            ),
            RTEC.chainFirstReaderIOKW(
              flow(
                O.isSome,
                changesNeeded => ({
                  preprintId: review.preprint.handle.identifier,
                  reviewId: review.uuid,
                  changesNeeded,
                }),
                l.debugP('Processed full review'),
              ),
            ),
          ),
      ),
    ),
  )
}

function maybeProcessFullReview(review: FullReview) {
  return pipe(
    RA.elem(s.Eq)(review.uuid, skippedReviews),
    b.match(
      () => processFullReview(review),
      () =>
        pipe(
          {
            preprintId: review.preprint.handle.identifier,
            reviewId: review.uuid,
            changesNeeded: false,
          },
          RTEC.fromReaderIOK(l.warnP('Skipped processing full review')),
          RTE.map(() => O.none),
        ),
    ),
  )
}

const findChangesRequired = pipe(
  getFullReviews,
  RTEC.chainFirstReaderIOKW(flow(reviews => ({ number: reviews.length }), l.debugP('Found full reviews'))),
  RTE.chainW(RTE.traverseSeqArray(maybeProcessFullReview)),
  RTE.map(RA.compact),
)

export const program = pipe(
  findChangesRequired,
  RTEC.chainReaderIOKW(
    RA.match(
      () => pipe(l.info('🎉 Nothing to do')),
      flow(fullReviews => ({ fullReviews }), l.infoP('👀 Changes needed')),
    ),
  ),
)
