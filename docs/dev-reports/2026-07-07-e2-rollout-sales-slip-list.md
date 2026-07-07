# E2 롤아웃 — 판매전표 목록 (soft-delete·복원·실시간) — 2026-07-07 (#758)

거래처(#756)·주문(#757)과 동일 E2 패턴을 판매전표(SLIP_OUTBOUND) 목록에 이식. `useCollectionRealtime` SSE + 삭제행 취소선/복원 + slip V56(`deleted_by_name`) + auth V84(sales.slip.list restore 권한).

## R1 5-agent 리뷰 + Opus fix (STEP4 = Opus 적대검증, Codex 한도 대체·개발책임자 승인)

Codex 개발분이 **거래처 STEP4-이전 패턴을 미러**해, 거래처 STEP4가 고친 결함들이 재유입됨 → R1 5-agent가 포착, Opus 직접 fix:

- **🔴 CRITICAL (BE) — 공유/레거시 소비처로 삭제행 누출 (감사자료 오염)**: Codex 가 `listIncludingDeleted`/`searchIncludingDeleted` 를 공용 메서드 `SlipService.list()`(=`GET /slips`·자동완성·**Excel export**)·`SlipQueryService.listForQuery()`(=`GET /slips/query`·판매/구매조회 화면) 에 무조건 주입 → 취소된 전표가 엑셀·기존 조회화면·INBOUND 목록에 활성전표와 구분 없이 노출. **fix**: 두 native 쿼리에 `includeDeleted` 플래그(기본 false=활성전용) 추가 + `SlipController` 는 **OUTBOUND & includeDeleted=true** 일 때만 opt-in. `searchIncludingDeleted`(판매/구매조회 전용)는 무조건 활성전용. Excel(1406 오버로드)·INBOUND 자동 활성전용. IT: `/slips/query`·`/slips` 기본 삭제행 미노출 회귀가드 2건 신설 + E2 목록은 `includeDeleted=true` opt-in.
- **🟠 HIGH (BE)**: `SlipRestoreService.restore()` 에 slipType OUTBOUND 가드 추가 (`deleteForSales` 대칭) — sales.slip.list RESTORE 권한만으로 INBOUND 전표를 UUID 로 복원하는 최소권한 우회 차단.
- **🟠 HIGH (FE)**: slipNo 취소선이 `SlipNumberDisplay`(inline-flex atomic) 조상 span 에 걸려 **전혀 렌더되지 않던 회귀** → 컴포넌트 자신에 `style` 직접 전달(HTMLAttributes 상속·`{...rest}` 확인). mock DELETE 핸들러 pagecode `sales.slip.list`→`sales.slip.edit`(BE/FE 게이트 정합).
- **🟠 HIGH (Design)**: 실시간 인디케이터 neutral-500(무여유·다크 FAIL)→neutral-600. 삭제행 status 컬럼이 원래 배지(초록 "확정")를 유지하던 것을 **"삭제됨" neutral 배지 오버라이드**(원래 상태 aria 보존).

## 검증 (genuine)

- BE `compileJava`/`compileTestJava` green. FE `typecheck` green.
- real-PG IT (`--rerun-tasks --no-build-cache`): `SlipListE2RealtimeRestoreIT` 8·`SlipQueryPurchaseIT` 21·`SlipQueryRedesignSpecIT` 5·`SlipServiceListSpecTest` 9 — **전부 0 failure**. 누출차단 회귀가드(`/slips/query`·`/slips` 기본 활성전용) 실행 확인.

## 백로그 (후속)

- SSE 구독권한: `SlipListRealtimeController` 가 `sales.slip.list` VIEW 단일 게이트 → WAREHOUSE(구매전용) 사용자가 INBOUND 목록에서 403+재시도. FE 에서 OUTBOUND 만 SSE 구독하도록 조건화 예정(MED, 폴링 폴백으로 기능은 유지).
- mock `GET /slips` includeDeleted parity(mock 전용). `searchIncludingDeleted` 명칭 rename(활성전용화됨). auth 크로스트랙 머지순 C(V83)→D(V84)→E(V85) 수동 게이트.
