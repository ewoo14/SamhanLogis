# E3 S4d — 입금보고서 작성폼/상세 실시간 coedit (born-live)

> 에픽 E3(회계 입금보고서). S4a(목록)·S4b(작성폼/상세)·S4c(벌크생성) 완료 → **S4d = coedit**(마지막).
> 설계문서: `docs/superpowers/plans/2026-07-03-e3-deposit-report-epic-design-exploration.md`

## 목표
입금보고서 **작성폼(CashReceiptFormPage)·상세(CashReceiptDetailPage)** 에 실시간 동시편집(coedit) 이식.
두 사용자가 같은 입금보고서를 열면 편집이 **저장 없이 즉시 상대 화면에 반영**(Yjs CRDT + SSE relay). born-live.

## 개발책임자 확정 정책 (설계문서)
1. **coedit 편집 = DRAFT 상태 한정.** CONFIRMED(POSTED 분개 발행됨)·CANCELLED·BANK_LINKED = **read-only**(coedit 비활성).
2. **입금보고서 = 비-원장 자유편집 대상**(원장 Journal 아님 → 편집 허용). soft delete.
3. 상태 라이프사이클 DRAFT→CONFIRMED→CANCELLED.

## 범위 (헤더 전용 — 품목라인 없음)
입금보고서는 헤더 전용 폼이라 estimate/slip 보다 단순. coedit 대상 필드:
- 거래처(partnerName/partnerCode/bizNo — PartnerAutocomplete)
- 거래일(transactionDate)
- 금액(amount)
- 차변계정(debitAccountCode)·대변계정(creditAccountCode)
- 메모/적요(memo, external_ref 등 편집 필드)

## 레퍼런스 패턴 (그대로 미러)
- **FE 폼 coedit**: `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`
  - `createDocCoeditProvider`(`../realtime/createCoeditProvider`) 로 provider 생성·seed(`setHeaderValue`).
  - `CollaborativeSlipInput`(`../components/collab/`) 로 필드 바인딩.
  - ⚠️ **provider 재생성 회피**: coedit useEffect deps 에 `query.data` 객체 넣지 말 것(리페치/SSE invalidate 마다 provider 재생성→세션 끊김·미저장 CRDT 유실. 듀얼리뷰 HIGH 교훈).
- **BE 코-에디팅 relay**: 기존 accounting/journal collab relay(`journalCollab`·realtime 파일군) 를 **cashReceipt 문서용으로 미러**(SSE relay·awareness·권한 게이트). slip/estimate 의 collab relay 구조 동일.
- 문서 식별: docType=`cash-receipt`(또는 기존 규약) + receiptId.

## 수용 기준
- 2세션(브라우저/데스크톱) 동일 입금보고서 DRAFT 열기 → 한쪽 필드 편집 → **반대편 즉시 반영**(SSE 왕복 실캡처).
- CONFIRMED/CANCELLED/BANK_LINKED = coedit 비활성(read-only) 실증.
- provider 재생성 회피(리페치 중 세션 유지) 회귀 테스트.
- 원장(Journal) 미접촉. 권한 게이트(VIEW/편집) 준수.
- 기존 S4a/b/c 회귀 0(vitest·IT). CI green.

## 비범위
- 원장 Journal 직접 편집(금지). BANK_LINKED 편집. 품목라인(입금보고서엔 없음).
