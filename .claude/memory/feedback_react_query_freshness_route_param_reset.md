---
name: feedback_react_query_freshness_route_param_reset
description: freshness-critical React Query(활성 상태/레이아웃 등)는 전역 staleTime 상속 시 stale — staleTime:0+refetchOnMount 필요. route-param(:id 등)에 귀속된 latch/결정 state는 passive useEffect reset이 아닌 key-remount로 격리. presence-only 단언·매 테스트 새 QueryClient는 false-green. 2026-07-18 #845 DS-2 R1/R2.
metadata:
  type: feedback
---

**사건(2026-07-18 #845 DS-2)**: 결재 인쇄 렌더러가 docType 활성 레이아웃을 조회·적용. 2-모델 적대검증이 CI 33/33 green 뒤에서 연쇄 결함을 포착:

1. **[CRITICAL] presence-only 테스트 false-green** — route-level 테스트가 `getByLabelText('결재문서 내용')`·`getByText(...)`·mock 호출여부만 단언. 이들은 **DEFAULT 레이아웃도 전부 렌더**하므로 "활성 레이아웃이 실제 적용됐는지"와 무관하게 통과. 그 사이 실제 코드는 활성 레이아웃을 항상 폐기(DEFAULT fallback)하고 있었음. **"기능 X가 적용됐다"를 테스트하려면 X **고유의 구별되는 출력**을 단언해야 함**(비기본 sparse 레이아웃 → 문서번호/첨부표 **부재**를 assert). presence 단언은 "죽은 기능"을 green으로 배송.

2. **[BLOCKING] 전역 QueryClient staleTime 상속 → stale** — 앱 전역 `staleTime: 5분`을 freshness-critical 쿼리(active 레이아웃)가 상속 → 관리자가 템플릿 활성화/비활성화해도 사용자가 5분간 stale 렌더. **freshness-critical 쿼리(활성 상태·라이브 status·재고 등)는 명시적으로 `staleTime: 0` + `refetchOnMount: 'always'`**(+ retry:false·refetchOnReconnect:false)로 매 마운트 fresh 강제. latch(1회 결정)는 `isLoading`(캐시 있으면 즉시 false)이 아닌 **`!isFetching && (isSuccess||isError)`**로 현 마운트 fetch 완료 대기·refetch 오류→기본값(캐시 데이터 아님).

3. **[BLOCKING] route-param state가 same-instance 네비에서 stale/깜빡임** — `:id`/`docType`에 귀속된 latch state를 passive `useEffect(()=>reset, [id,docType])`로 초기화하면 **post-render라 이전 결정+새 model이 1프레임 혼합 렌더**(깜빡임)되고, 동일 query key(같은 docType)+캐시 시 refetch 미발동으로 stale. **fix = key-remount로 동기 격리**: `<Inner key={id} id={id}/>` + 내부 `<Layout key={docType} .../>` 2단. key 변경 시 React가 fresh 마운트→state/query epoch 초기화→refetchOnMount 발동. React 관용 패턴("reset state on prop change = key").

4. **테스트가 매 케이스 새 QueryClient → 캐시 회귀 미포착** — staleTime/캐시 전환 버그는 **동일 QueryClient에서 A→B(또는 null→active·active→null) 전환**해야 재현. 매 테스트 fresh QueryClient는 이 경로를 놓침. 캐시 정합 회귀는 **공유 QueryClient + 2-캐시 전환 시나리오**로 테스트.

**Why**: ①②③ 모두 **CI green(단위/mock 게이트 전부 통과)이었고 단일 모델(OPUS R1)도 ①은 잡았으나 ②③은 CODEX SOL(R2)이 교차로 포착** — freshness/캐시/route-param 상호작용은 "새 QueryClient·presence 단언"의 표준 테스트 관성으로 가려짐. **CI green ≠ 정확**([[feedback_verify_playwright_gate_before_adversarial]]).

**How to apply**:
1. **freshness-critical React Query** = `staleTime:0`+`refetchOnMount:'always'`. 전역 staleTime 상속 여부 확인.
2. **route-param(:id)에 귀속된 결정/latch state** = passive reset 대신 **`key={param}` remount**. docType처럼 서버응답 유래 파생 key는 별도 하위 컴포넌트 key로 격리.
3. **"기능 적용됨" 테스트** = 기능 고유 **구별 출력** 단언(presence 금지). 렌더 회귀는 실 렌더러 출력(바이트/구조) 대조.
4. **캐시 회귀 테스트** = 공유 QueryClient + 캐시 전환 시나리오. late-resolve/reconnect/2-cache 포함.

→ [[feedback_reconvergence_before_merge]](2-모델 교차 재수렴)·[[feedback_design_system_playwright_mock_suite]](행동 회귀 게이트)·[[feedback_verify_playwright_gate_before_adversarial]](CI green≠정확)·[[feedback_inprocess_mock_principles]].
