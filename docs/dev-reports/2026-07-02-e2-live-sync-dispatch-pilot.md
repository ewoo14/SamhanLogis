# E2 기둥1 — 전역 라이브 컬렉션 동기화 (배차 파일럿) dev-report

PR #699 · 브랜치 `feat/e2-live-collection-sync-dispatch` · 2026-07-02

## 목표
개발책임자 지시(모든 메뉴 데이터 실시간 반영: 생성/수정[저장시점]/삭제)의 **기둥1(라이브 컬렉션 동기화)** 를 공유 헬퍼로 일반화하고 **배차현황 목록/보드**에 파일럿 적용. (기둥2 취소선 삭제+복원=Plan B, 배차 전표확인 미리보기=Plan C 분리.)

설계: `docs/superpowers/specs/2026-07-02-global-live-sync-strikethrough-delete-design.md`
계획: `docs/superpowers/plans/2026-07-02-e2-live-collection-sync-dispatch-pilot.md`

## 아키텍처 (product-catalog 패턴 일반화)
- **shared/realtime-abstraction `CollectionRealtimePublisher`**: 활성 트랜잭션이면 `afterCommit` 지연 발화(롤백 시 미발화), 없으면 즉시. `RealtimeAutoConfiguration` @Bean(@ConditionalOnMissingBean).
- **slip-service `DispatchBoardRealtime`**: 결정적 채널 UUID(`nameUUIDFromBytes("dispatch:board:changed")`) + `EVENT_CHANGED`.
- **`DispatchBoardRealtimeController`**: `GET /admin/dispatch-tasks/board-realtime` SSE, `@RequirePermission(dispatch.board, VIEW)`, 기존 `SlipRealtimeBroker` 재사용.
- **발화 배선(전 board-visible mutation 10서비스)**: DispatchTaskService(CREATED/UPDATED/DELETED) · Completion/Confirm/Unavailable/Redispatch/ManualComplete/Modification·Cancellation Request·Decision(STATUS_CHANGED) · ExternalDispatch(if sent, STATUS_CHANGED).
- **FE**: `DispatchTaskRealtimeClient`(고정 경로 SSE) + `useCollectionRealtime(client, sentinel, queryKeys[])` 공통 훅(mock skip·단일 구독·다중 key invalidate·언마운트 abort) → DispatchHistoryPage(목록+열린 상세 detail key)·DispatchBoardPage(taskId 유무별 board/list/detail key) 배선. payload opaque, 수신 시 react-query refetch.
- **게이트웨이**: 기존 `slip-dispatch-admin-noprefix` no-strip 라우트가 SSE endpoint 커버(무변경).
- 모바일: WebView 웹 번들 SSE 자동 반영(RN 신규 코드 불요).

## 순차 5-agent 듀얼리뷰 (총 11 blocking 적발·수정)
단위/컴파일 미검출 라이브 결함을 순차 듀얼리뷰가 적발:
- **Opus 라운드1(8)**: 발화 누락 계열 sweep — Redispatch·ManualComplete·setMatchedDriver·부분confirm(completed 게이트 제거) + sweep 추가발견 4(Modification·Cancellation Request/Decision). + CI false-green(`:shared:realtime-abstraction:test` 미등재 → skipped=0 hard gate 추가).
- **Codex 라운드1(2)**: DispatchBoardPage SSE 미구독(보드 stale) → useCollectionRealtime 다중키 일반화 + 보드 구독. ExternalDispatchService 발화 누락.
- **CI RED fix**: `RealtimeAutoConfigurationTest` redis 케이스가 실 localhost:6379 접속 시도(CI Linux startup 실패, 로컬 Windows 우연 통과 false-green) → mock 주입 hermetic화.
- **Opus 5-agent 수렴(0)**: 전 차원 재검 0 blocking + QA 커버리지 보강(발화 verify 전수·DELETED assert·SMS실패 never-publish).
- **Codex 라운드2(1)**: DispatchHistoryPage 열린 상세 모달 detail key 미무효화 → 포함.
- **Codex 5-agent 최종(0)** → 0수렴.

## 라이브 QA (실서버 SSE round-trip)
`docs/qa/e2-live-sync-dispatch/` — Docker(slip-service 새 jar 재빌드 healthy)+게이트웨이 :8080+dev_master 실 로그인. SSE 구독→`POST /admin/dispatch-tasks`(201, taskCode 2026/07/02-1 실커밋)→구독 스트림에 **`event:dispatch:board:changed data:{"changeType":"CREATED"}` 실수신**. publish→delivery end-to-end 실증. connected entityId=결정적 채널 UUID 일치.

## 검증
- CI **33/33 green**(Desktop Playwright hard gate 포함). shared realtime-abstraction test CI 등재+skipped=0 gate. slip IT slip-it-core 실행.
- 단위: CollectionRealtimePublisher(afterCommit/rollback/즉시 3)·발화 verify 전수·FE useCollectionRealtime(jsdom, 단일구독·다중invalidate·mock skip)·실커밋 publishCount IT.

## 비차단 follow-up (후속)
1. **동시편집 충돌 UX(Design MEDIUM 2)**: ①보드 드래그 중 원격 refetch→@dnd-kit items 교체 드래그 튐 ②상세 협업메모 편집 중 원격 memo 변경→refetch effect 입력 리셋. 활성 드래그/편집 중 invalidate defer 검토. 저장충돌 후속 범위.
2. **FE 모달 토글 재구독**: useCollectionRealtime deps(queryKeys) 변경 시 SSE 재연결 1회(누수 없음). 구독 identity를 invalidate 타깃과 분리하면 제거 가능(공유 훅 리팩터).
3. **slip publish IT 전용 skipped=0 gate 부재**: slip-it-core glob 의존(기존 정책 일관). 대표 IT gate 추가 고려.
4. **gateway route IT**: no-strip 라우트 직접 assert 부재(설정엔 포함).

## 다음
E2 기둥2(취소선 삭제+복원) Plan B → 배차 전표확인 미리보기 Plan C → 도메인 점진 롤아웃(판매전표·주문·견적·거래처·재고·회계 목록).
