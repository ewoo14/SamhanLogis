# E3 입금보고서 S1 — CashReceipt 도메인 기반 (수기 CRUD·상태·born-live)

**PR #709** · 2026-07-03 · accounting-service + auth-service + shared/collab-core + clients/desktop(PageCode parity)

## 목표
입금보고서(CashReceipt)를 MIG 배치 적재 전용 → **라이브 수기 CRUD + 상태 라이프사이클**. E3 epic S1(분개=S2·통장=S3·FE=S4).

## 개발책임자 확정 결정
- 상태 `DRAFT→CONFIRMED→CANCELLED`(CONFIRMED 시 분개=S2, coedit=DRAFT 한정, CANCELLED=역분개=S2).
- ③ 분개 계정 기본 차 보통예금(103)/대 외상매출금(110) + **사용자 변경 가능**.

## 구현 (Codex)
- `CashReceiptStatus` enum·`CashReceipt` 확장(status·debit/credit 계정·`@Version` 낙관락·`createManual`/`updateDraft`/`confirm`/`cancel`/`softDeleteDraft` 도메인 메서드 chain).
- `CashReceiptNumberService`/`Sequence`(slip_no 채번 `yyyy/MM/dd-N`·PESSIMISTIC_WRITE+ON CONFLICT).
- `CashReceiptService`(createManual·list[Specification]·getOne·updateDraft·confirm·cancel) — 상태가드 우선·입력 거래처는 `partnerCode/bizNo/partnerName` resolve·partner display 배치 resolve(`PartnerLookupClient.findByPartnerIdsBatch`)·journalNo resolve.
- `CashReceiptController` `/accounting/cash-receipts` CRUD·`@RequirePermission(accounting.cash-receipts)`·**UUID 화면 비노출**(request=partnerCode/bizNo/partnerName, mutation/detail/realtime path=`{id}` UUID, response `id`는 Journal 패턴의 mutation용 식별자, 화면 표시는 slipNo/partnerCode/bizNo/partnerName/journalNo).
- PageCode `accounting.cash-receipts`(auth) + FE parity(`permissionsApi.ts`·`PermissionMatrixPage`).
- 마이그: **accounting V48**(status DEFAULT CONFIRMED 소급·debit/credit 계정·CHECK·채번 시퀀스·collab doctype) + **V49**(version 낙관락·V48 불변 준수) + **auth V80**(PageCode 시드 MASTER/MANAGER/ACCOUNTANT·V79 교훈 스코프 제한).
- born-live: `CollabDocumentType.ACCOUNTING_CASH_RECEIPT`·`AccountingLockPolicies.CASH_RECEIPT`(DRAFT free/CONFIRMED 승인/CANCELLED 종결)·SSE·`CashReceiptDocumentCollaborationPort`(+단위테스트).
- **S1 범위**: 분개 미생성(journalId null)·MIG9 `DEPOSIT_REPORT` 한정(수기분 배치분개 제외).

## 리뷰 (순차 듀얼)
- **Opus 5-agent R1**: BLOCKING 2·HIGH 2·MED 3·LOW/NIT 다수. 핵심 — ①CollabDocumentType enum **커밋 누락**(PM `git add services/`만 → shared 누락·compile fail, 커밋 위생 실수) ②permissionsApi PageCode parity ③@Version 낙관락 부재 ④partner/journal 표시필드 부재. **Opus+Codex 직접 fix**: 전 경로 커밋·@Version+V49·partner/journal resolve·validateAccounts 순서·dead repo 제거·actor 정리·Javadoc·port 테스트.
- **Codex 5-agent review fix**: UUID 화면 비노출 계약 보강(request `partnerId` 제거→`partnerCode/bizNo/partnerName` resolve, 화면 표시는 slipNo/거래처명, mutation/detail/realtime은 Journal 패턴과 동일하게 `{id}` path-var+response `id` 유지), 상태전이 IT 보강(DRAFT cancel·confirm 재호출·재cancel·CONFIRMED/CANCELLED delete 거부), 문서 UUID 예시 제거.
- **로컬 검증(2026-07-03)**: `.\gradlew.bat --rerun-tasks :services:accounting-service:test --tests "com.samhanair.logis.accounting.it.CashReceiptControllerIT" --tests "com.samhanair.logis.accounting.editrequest.lock.AccountingLockPoliciesTest" --tests "com.samhanair.logis.accounting.service.Mig9CashJournalServiceTest" :services:auth-service:test --tests "com.samhanair.logis.auth.it.AuthFlywayV80SeedIT"` → BUILD SUCCESSFUL, 28 tasks executed. 세부 evidence: `docs/qa/e3-s1-cash-receipt-domain/verification.md`.

## backlog (비차단)
- S4 작성폼 UX는 `partnerCode/bizNo/partnerName` 선택/검색으로 구현하고, 내부 `partnerId`는 화면/응답에 노출하지 않는다.
- slip_no MIG(dash) vs 신규(slash) 표시 = slash 규약 유지·후속 데이터정비.
- born-live lock 정책 실소비(승인 consume)는 accounting 전역 기존 미배선(S4/후속).
- ⚠️ **로컬 auth_db V79 checksum mismatch**(#706 V79 재수정 여파) — 팀 공유·로컬 flyway repair/fresh 필요([[feedback_applied_migration_immutable]] 교훈: 로컬 적용 마이그도 불변).
