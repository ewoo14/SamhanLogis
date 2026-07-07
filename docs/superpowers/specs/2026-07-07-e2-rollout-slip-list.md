# E2 롤아웃 — 판매전표(출고전표) 목록 실시간 동기화·취소선 삭제/복원

> Track D. 배차 파일럿(#699/#700) → 거래처(#756) → 주문(#757) 로 확립된 **E2 목록 실시간 동기화 패턴**을 **판매전표 목록(SlipListPage, `/sales/slips`, mode=OUTBOUND, SLIP_OUTBOUND=판매전표)** 으로 롤아웃.
> BE = slip-service. FE = clients/desktop SlipListPage.

## 목표
판매전표 목록에 다음 E2 요소 이식(거래처/주문 목록과 동일 UX):
1. **목록 실시간 SSE**: `useCollectionRealtime` 훅으로 멀티 워크스테이션 실시간 반영. BE `.../slips/list-realtime`(또는 board-realtime) SSE, `slip:list:changed` 이벤트, afterCommit 발화(CollectionRealtimePublisher 패턴).
2. **soft-delete 취소선 메타**: 삭제행을 목록에 취소선 + "삭제:{이름}" 배지(deletedByName·UUID 비노출)로 노출. `searchIncludingDeleted` + deleted_by_name.
3. **복원(restore)**: 삭제행 인라인 복원 버튼(권한 게이트) + `POST .../slips/{id}/restore`.
4. **status 필터**: SlipStatus 필터(기존 있으면 realtime/삭제와 정합 확인).

## 레퍼런스 (그대로 미러 — 검증된 패턴)
- BE: 거래처 `PartnerListRealtimeController`+`CollectionRealtimePublisher`+`searchAdminIncludingDeleted`(String status CAST)+restore dual-row 409 가드. 주문 `PartnerOrderBoardRealtimeController`.
- FE: `PartnersPage.tsx`(coarse SSE 키 모듈상수·rowKey 합성·복원 onError=extractApiErrorResponseMessage·DataTable rowClickable 삭제행 비활성·삭제됨 배지).
- 듀얼리뷰 교훈 필수 반영: enum→native query 는 **String `.name()` CAST**(ordinal 0건 버그 방지)·restore 시 **동일코드 활성행 공존=CONFLICT 409**·DataIntegrityViolation→409·복원 onError BE 한국어 메시지·복원배너 대비 `var(--color-danger-700)`.

## 마이그레이션 번호 (크로스트랙 충돌 방지 — 확정)
- slip-service: **V56**(slips deleted_by_name 컬럼, 기존 없을 시). max=V55 다음.
- auth-service: **V84**(sales.slip.list 복원 권한 시드). ⚠️Track C=V83·Track D=V84·Track E=V85 로 예약. C→D→E 순 머지.

## 수용 기준
- 2세션 목록 SSE 실시간 반영(삭제/복원 브로드캐스트) 라이브 실증.
- 삭제행 취소선+배지·복원(net-neutral)·status 필터 discrimination.
- real-PG IT(status 필터·삭제 메타·복원 409·SSE 발화 verify·권한). 기존 slip 회귀 0. CI green.
- 원장(회계 Journal) 미접촉. UUID 비노출. 한국어. dev-report.

## 비범위
- 전표 작성/발행 로직 변경. 입고전표(별도). 원장 편집.
