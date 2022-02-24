import { createTwoFilesPatch, parsePatch } from 'diff'
import * as IOO from 'fp-ts-contrib/IOOption'
import * as C from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Reader'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as RA from 'fp-ts/ReadonlyArray'
import * as RNEA from 'fp-ts/ReadonlyNonEmptyArray'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { constant, flow, pipe } from 'fp-ts/function'
import * as l from 'logger-ts'
import { logError } from './api'
import { FullReview, getFullReviews, getPersona } from './prereview'
import { ZenodoRecord, ZenodoRecordC, ZenodoRecordIdFromDoiD, getRecord } from './zenodo'

const getRecordIdFromDoi = flow(
  ZenodoRecordIdFromDoiD.decode,
  RTE.fromEither,
  // RTE.chainFirstReaderTaskKW(
  //   flow(recordId =>
  //     pipe(
  //       {
  //         recordId,
  //         reviewId: review.uuid,
  //       },
  //       l.debugP('Found record ID for review'),
  //       R.map(T.fromIO),
  //     ),
  //   ),
  // ),
  RTE.orElseFirst(logError('Unable to turn DOI into Zenodo record ID')),
  RTE.mapLeft(constant(new Error('Unable to turn DOI into Zenodo record ID'))),
)

function getRecordId(review: FullReview) {
  return pipe(
    review.doi,
    E.fromNullable(new Error('No DOI')),
    RTE.fromEither,
    RTE.orElseFirstW(() =>
      pipe(
        {
          preprintId: review.preprint.handle.identifier,
          reviewId: review.uuid,
        },
        l.warnP('No DOI'),
        R.map(TE.rightIO),
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
          license: O.some({
            id: 'CC-BY-4.0',
          }),
          related_identifiers: pipe(
            existing.conceptdoi,
            O.map(conceptdoi => [
              {
                scheme: 'doi',
                identifier: conceptdoi,
                relation: 'isVersionOf',
              },
              // {
              //   ...review.preprint.handle,
              //   relation: 'reviews',
              // },
            ]),
          ),
          resource_type: {
            subtype: 'article',
            type: 'publication',
          },
          title: `Review of ${review.preprint.title}`,
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
            RTE.chainFirstReaderTaskKW(() =>
              pipe(
                {
                  preprintId: review.preprint.handle.identifier,
                  reviewId: review.uuid,
                  changesNeeded: true,
                },
                l.warnP('Skipped processing full review'),
                R.map(T.fromIO),
              ),
            ),
          ),
        record =>
          pipe(
            createExpectedRecord(review, record),
            RTE.map(expectedRecord =>
              createTwoFilesPatch(
                record.links.latest.href,
                `https://www.prereview.org/api/v2/full-reviews/${review.uuid}`,
                JSON.stringify(ZenodoRecordC.encode(record), null, 2) + '\n',
                JSON.stringify(ZenodoRecordC.encode(expectedRecord), null, 2) + '\n',
              ),
            ),
            RTE.chainIOK(
              flow(
                O.fromPredicate(flow(parsePatch, patch => patch[0].hunks.length > 0)),
                IOO.fromOption,
                IOO.chainFirst(flow(C.log, IOO.fromIO)),
                IOO.map(() => review.uuid),
              ),
            ),
            RTE.chainFirstReaderTaskKW(changesNeeded =>
              pipe(
                {
                  preprintId: review.preprint.handle.identifier,
                  reviewId: review.uuid,
                  changesNeeded: pipe(changesNeeded, O.isSome),
                },
                l.debugP('Processed full review'),
                R.map(T.fromIO),
              ),
            ),
          ),
      ),
    ),
  )
}

const findChangesRequired = pipe(
  getFullReviews,
  RTE.chainFirstReaderTaskKW(
    flow(reviews => ({ number: reviews.length }), l.debugP('Found full reviews'), R.map(T.fromIO)),
  ),
  RTE.chainW(RTE.traverseSeqArray(processFullReview)),
  RTE.map(RA.compact),
)

export const program = pipe(
  findChangesRequired,
  RTE.chainReaderTaskKW(
    RA.match(
      () => pipe(l.info('🎉 Nothing to do'), R.map(T.fromIO)),
      flow(fullReviews => ({ fullReviews }), l.infoP('👀 Changes needed'), R.map(T.fromIO)),
    ),
  ),
)
