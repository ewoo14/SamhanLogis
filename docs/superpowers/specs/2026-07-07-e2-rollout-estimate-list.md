# E2 롤아웃 — 견적서 목록 실시간 동기화·취소선 삭제/복원

> Track E. 배차(#699/#700)→거래처(#756)→주문(#757) 로 확립된 **E2 목록 실시간 동기화 패턴**을 **견적 목록(EstimateListPage, `/sales/estimates`)** 으로 롤아웃.
> BE = slip-service(estimate/*). FE = clients/desktop EstimateListPage.

## 목표
견적 목록에 E2 요소 이식(거래처/주문 목록과 동일 UX):
1. **목록 실시간 SSE**: `useCollectionRealtime` 로 멀티 워크스테이션 실시간. BE `.../estimates/list-realtime` SSE, `estimate:list:changed`, afterCommit 발화.
2. **soft-delete 취소선 메타**: 삭제행 취소선 + "삭제:{이름}" 배지(deletedByName·UUID 비노출). `searchIncludingDeleted` + deleted_by_name.
3. **복원(restore)**: 삭제행 인라인 복원 버튼(권한 게이트) + `POST .../estimates/{id}/restore`.
4. **status 필터**: EstimateStatus(QUOTE_DRAFT/SENT/ACCEPTED/REJECTED/CONVERTED) 필터가 realtime/삭제와 정합.

## 레퍼런스 (그대로 미러 — 검증된 패턴)
- BE: 거래처 realtime publisher/`searchAdminIncludingDeleted`(String status CAST)/restore dual-row 409. estimate 는 이미 revision/collab 인프라 有(EstimateCollabController 등) — 목록 realtime/soft-delete 만 추가.
- FE: `PartnersPage.tsx` 패턴(coarse SSE 키·rowKey 합성·복원 onError=extractApiErrorResponseMessage·DataTable rowClickable·삭제됨 배지).
- 듀얼리뷰 교훈 필수: enum→**String `.name()` CAST**·restore **동일식별자 활성행 공존=409**·DataIntegrityViolation→409·복원 onError BE 한국어·복원배너 `var(--color-danger-700)`·CONVERTED(주문전환됨) 견적 삭제/복원 정책 확인.

## 마이그레이션 번호 (크로스트랙 충돌 방지 — 확정)
- slip-service: **V57**(estimates deleted_by_name 컬럼, 기존 없을 시). ⚠️Track D=slip V56·Track E=slip V57.
- auth-service: **V85**(sales.estimate.list 복원 권한 시드). ⚠️C=V83·D=V84·E=V85. C→D→E 순 머지.

## 수용 기준
- 2세션 목록 SSE 실시간 반영(삭제/복원 브로드캐스트) 라이브 실증.
- 삭제행 취소선+배지·복원(net-neutral)·status 필터 discrimination.
- real-PG IT(status 필터·삭제 메타·복원 409·SSE 발화 verify·권한). 기존 estimate 회귀 0(revision/collab 무영향). CI green.
- 원장 미접촉. UUID 비노출. 한국어. dev-report.

## 비범위
- 견적 작성/수식/coedit 로직 변경(기존 유지). 종합견적서 estimate-app 변경.
