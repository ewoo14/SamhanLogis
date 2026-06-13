# §7 전역 협업 슬라이스 1 — 회계전표(ACCOUNTING_VOUCHER) 협업 (dev-report)

- 일자: 2026-06-13
- PR: #475 · 브랜치 `feat/global-collab-accounting-voucher`
- 에픽: §7 전역 협업 · 레퍼런스 슬라이스 0(입출고전표, PR #474 머지 `30b0ce93a`)
- 구현: Codex · 통합/검증/리뷰: Claude(Opus) PM

## 1. 개요

slip-service 의 `shared:collab-core` 협업 패턴(수정완료 1-인 + 코멘트 + diff + 알림)을 accounting-service 의 `Journal`(분개) 도메인에 복제한 두 번째 문서 슬라이스. 확정/완료 상태(POSTED) 회계전표를 권한자 본인이 "수정"→편집→"수정완료"(즉시 커밋)하는 1-인 수정 모델 + 코멘트 + 버전 diff + 알림.

## 2. 정책 (개발책임자 확정 2026-06-13)

| 항목 | 결정 |
|---|---|
| 수정완료 편집 범위 | **적요(`Journal.description`) + 라인메모(`JournalLine.memo`) 비-원장 필드만**. 차대변 금액/계정/일자/전표번호는 불변(변경=역분개 reverse) — 회계 무결성 보존. 원장 키 changeSet 은 400 거부. |
| 수정완료 잠금 | `COLLAB_LOCKED = {REVERSED}` 만 409. DRAFT·POSTED overlay 편집 허용. |
| 알림 수신자 | 기여자만(결재자 개념 없음): `createdBy` + `postedBy` + 제안자/결정자 + 코멘트작성자. self-skip, username→UUID resolve, 인-트랜잭션 동기 best-effort. |
| 권한 | 기존 `accounting.journals` page-code 재사용(reads→VIEW, writes→UPDATE). 전용 코드·auth 마이그레이션 불요. |

## 3. 구현

### BE (accounting-service)
- `collab/JournalDocumentCollaborationPort` — DocumentCollaborationPort 구현(ACCOUNTING_VOUCHER). loadSnapshot/applyChangeSet/restoreSnapshot/canPropose/canDecide/resolveNotificationRecipients + overlay 키 파싱(`description`·`line.{lineNo}.memo`, lineNo **1-based**) + 원장 키 400 거부.
- `collab/JournalCollabEditService.commitEdit` — 수정완료 6단계(권한→enrich→적용→ACCEPTED 저장→알림→SSE).
- `service/JournalService.applyOverlayPatchBatch` — 적요+라인메모만 적용·`guardCollabModifiable`(REVERSED 409)·단일 audit·도메인 메서드 체인.
- `collab/JournalCollabComment(+Repository)`, `JournalCollabSuggestion(+Repository, @Version)` — BaseEntity 7 audit + Soft Delete.
- `web/collab/JournalCollabController` — base `/accounting/journals/{journalId}/collab`, 7 엔드포인트 + SSE.
- `client/UserIdResolver`·`AuthAccountLookupClient`·`NotificationClient` — username→UUID resolve + 알림 push.
- `db/migration/V36__add_journal_collab_tables.sql` — journal_collab_comments/suggestions(CHECK 제약, 인덱스, `decided_at TIMESTAMPTZ`=Instant 매핑).

### shared:collab-core (PM 근본 fix)
- `CollabCoreAutoConfiguration` 에 `@AutoConfigureAfter(RealtimeAutoConfiguration)` — `@ConditionalOnBean(RealtimeBroker)` 가 auto-config 평가 순서에 민감. 자체 broker 빈을 둔 slip 은 무관하나 auto-config `InMemoryRealtimeBroker` 에 의존하는 서비스(accounting 등)는 순서 보장 필요(publisher 누락 → editService 생성 실패). **에픽 전체 문서 서비스가 함정 회피.**

### FE (clients/desktop)
- `api/journalCollab.ts` — collab API 클라이언트.
- `components/collab/JournalCollaborationPanel.tsx` — 적요+라인메모 편집(원장 금액/계정 읽기전용)·코멘트·diff(before→after)·SSE.
- `realtime/JournalCollabRealtimeClient.ts` — SSE 구독.
- `routes/JournalDetailPage.tsx` — 협업 패널 통합 + 수정 버튼(`canAccess('accounting.journals','update') && status!=='REVERSED'`, 편집 중 은닉). 라인 # = `lineNo`(1-based, 협업 패널과 일관).
- `api/accounting.ts`·`JournalFormPage.tsx` — `JournalLine.memo` 정참조.
- `api/mock.ts` + `playwright/journal-collab/*.spec.ts` — mock 핸들러(memo·1-based) + 회귀 spec.

## 4. 검증

- BE `JournalCollabIT` **9건 PASS**(실 Testcontainers Postgres): 코멘트 CRUD·POSTED 수정완료+ACCEPTED 이력·다중라인 불변·REVERSED 409·원장키 400·알림 기여자 resolve·username→UUID·DRAFT 성공·GET /edits·빈 changeSet 400·CHECK 제약.
- accounting 전체 테스트 회귀 0 · slip collab 회귀 0(collab-core 변경 무영향) · desktop typecheck green · journal-collab playwright 3/3 · 전체 desktop playwright(mock 회귀).
- 실서버 Docker QA(게이트웨이 :8080, dev_master 실로그인): 수정완료 즉시 커밋(description 실변경·memo 보존) + diff before→after 시각화 + 코멘트 (9컷 `docs/qa/journal-edit-collab/`).

## 5. 다모델 리뷰

- Round A(Opus 5-agent): P1 4건(lineNo 0↔1-based·mock note↔memo·setQueryData·수정버튼 editMode) + IT 보강 fix. 실서버 QA 가 추가 off-by-one(DataTable #) 적발.
- Round B(Codex)~ : 진행.

## 6. 비결함 처리 (PM 검증)
- V36 `decided_at TIMESTAMPTZ` — `CollabSuggestionRecord.decidedAt=Instant` 정확 매핑(거짓양성).
- canAccess granularity — FE writes=`accounting.journals/update` = BE `@RequirePermission` 정확 일치(의도된 정책).

## 7. 회계 문서번호 표준 슬래시 표준화 (개발책임자 추가 지시, 스코프 확장)

Round C 중 개발책임자가 스크린샷에서 회계 문서 번호의 표준 미준수를 적발 → "슬래 모두 표준화" 지시. 본 PR 에 포함.

- **생성기(production)**: JournalNumberService·TaxInvoiceNumberService(`yyyyMMdd`→`yyyy/MM/dd`), Sales/PurchaseAccountingSlipNumberGenerator(`SAS-`/`PAS-` prefix 제거+`yyyy/MM/dd`). 표준 = SlipNumberService. 회계 문서 UUID 라우팅이라 게이트웨이 `%2F` 무관.
- **Flyway 시드(체크섬 안전)**: 기존 V2/V6/V8/V9/V10/V12 **원복** + 신규 forward **V37** seed journal_no/tax_invoice_no slash UPDATE(28건 per-row). 기존 dev DB 재부팅 healthy 실증.
- **JournalSeeder(데모 50건)**: `yyyy/MM/dd-{날짜별 순번}` + 시드-UUID를 journalNo 파생→**seq 안정키 분리**(형식 독립 멱등 유지). dev DB 클린 리셋 후 66건 전부 slash·중복 0.
- 2대 함정 박제: [[feedback_slip_order_number_format]] (①기존 마이그 수정 금지=forward UPDATE ②결정적 시드 UUID 를 비즈니스번호 파생 금지).
- 검증: full 회계 테스트 BUILD SUCCESSFUL(seed IT 4종 slash 정합) + 전체 desktop playwright 506/506 + 실서버 분개장 all-slash 캡처.
