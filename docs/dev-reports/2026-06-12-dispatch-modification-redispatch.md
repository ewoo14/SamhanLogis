# 배차 #3 — 수정제안 재배차 루프/수동기입 정책 dev report

## 범위

- 재배차 시작 endpoint: `POST /admin/dispatch-tasks/{taskId}/start-redispatch`
- 수정수락 task: `MODIFICATION_ACCEPTED -> DRAFT`
- 기존 발송 그룹: `DISPATCHED -> PENDING`
- 매핑 전표: `DISPATCHED -> UNDISPATCHED`
- 기존 arologis Dispatch: internal soft-delete 호출, 로컬 무연동 실패는 graceful warning
- 수동기입 vendor: `AROLOGIS`, `GYEONGGI_QUICK`, `JEONGUK_HWAMUL`, `OTHER` enum + DB CHECK
- 타사 수동 발송완료: 수동 기사/차량 입력 후 그룹 `DISPATCHED`, 매핑 전표 `DISPATCHED`

## 결정

- D-DMR-01: 재배차 진입은 전용 mutation으로만 수행한다. `MODIFICATION_ACCEPTED` 상태에서 바로 편집하지 않고 `start-redispatch` 성공 후 DRAFT 편집 흐름을 재사용한다.
- D-DMR-02: 수동기입 vendor는 자유 문자열을 금지하고 enum + CHECK로 표준화한다. 기존 arologis/외부 자동 매칭 source 문자열은 `AROLOGIS` 대표값으로 정규화하고, 기존 `MANUAL` 값은 `OTHER` 로 보존한다.
- D-DMR-03: arologis 재배차는 delete-recreate 정책을 유지한다. 기존 dispatch soft-delete 실패는 재배차 자체를 막지 않는다.
- D-DMR-04: 그룹별 dispatch-id 테이블화는 후속으로 남긴다. 이번 slice는 task 단일 `arologisDispatchId`를 재배차 시작 시 null로 비우고, 재발송 confirm 시 새 id로 갱신하는 기존 모델을 모순 없이 닫는다.

## multi-dispatch-id 검토

현재 `DispatchTask`는 단일 `arologisDispatchId`만 보유한다. 부분 발송과 그룹 단위 재발송을 정확히 추적하려면 `dispatch_vehicle_group` 또는 별도 `dispatch_group_arologis_mapping` 수준의 id 이력이 필요하다.

이번 범위에서는 스키마 확장을 하지 않는다. 대신 재배차 시작 시 기존 단일 id를 soft-delete 대상으로 명시 사용한 뒤 null 처리하고, 재발송 confirm에서 새 id를 task에 다시 저장한다. 이 방식은 전체 재배차 delete-recreate 흐름에는 일관적이나, 과거 부분 발송 id 감사에는 한계가 있다.

## Round C (Fable5 리뷰 fix + 개발책임자 결정)

### 결정 (추가)

- D-DMR-05: arologis `matchAndNotify` 는 **동기 유지**, confirm 타이밍의 AFTER_COMMIT/async 전환은 defer 한다. 현재 confirm 회신은 로컬 sync-skeleton(Mock matcher) 한정 동작이고, `InsungQuickIntegrationIT` 가 동기 `Vehicle.status=ASSIGNED` 를 단언한다. 비동기 전환은 실 vendor 연동 슬라이스에서 트랜잭션 경계와 함께 재설계한다.
- D-DMR-06: **부분발송 그룹별 dispatch-id 정밀화는 defer**, 대신 추가 부분발송을 409 로 명시 차단한다. 이미 DISPATCHED 그룹이 있는 task 의 `dispatch()` 는 `"이미 아로로지스로 발송된 배차입니다 — 수정하려면 [재배차 시작] 후 전체 재발송하세요"` 로 거부한다 (단일 arologisDispatchId 덮어쓰기 + arologis insert-only 수신과의 충돌 차단). 첫 발송(전체/선택)과 재배차(전 그룹 PENDING + DRAFT) 만 허용. 부분발송 후 남은 그룹은 수동 발송완료로 닫는다.
- D-DMR-07 (개발책임자 결정, **Option A**): 재배차 진입 = **배차현황(완료배차) 상세에서 수정요청 허용**. DISPATCHED 상세에 [수정 요청]/[취소 요청], MODIFICATION_ACCEPTED 에 [재배차 시작] 노출 (UPDATE 권한 가드, VIEW 전용 미노출). 모달은 `allowTaskActions` prop 으로 board/history 양쪽 제어하고, 배차현황 코멘트는 조회 전용(readOnly) 을 유지한다. 요청 발송 후 상세 모달은 닫지 않고 유지해 회신 배너 → 재배차 진입을 같은 세션에서 잇는다.

### P1 fix

- **arologis silent 파괴 차단**: `DispatchReceiveService.receive()` 의 기존 active dispatch soft-delete(같은 (date,type) fallback 이 kakao-native dispatch 를 silent 파괴) 제거 → **insert-only**. `V22__narrow_dispatch_date_type_unique_to_kakao_native.sql` 로 `ux_dispatches_date_type_active` 를 `WHERE samhan_dispatch_task_id IS NULL` (kakao-native 한정) 으로 좁힘 — samhan task 는 `ux_dispatches_samhan_task_active`(V21) 가 task 당 active 1 거버넌스 (같은날 2회차 task·kakao 공존). DDL 멱등 (DROP IF EXISTS → CREATE IF NOT EXISTS).
- **부분발송 명시화 409**: 위 D-DMR-06 — `DispatchTaskCompletionService.dispatch()` + mock parity + 단위테스트 역전(기존 부분발송 계속 허용 테스트 → 409 단언, 재배차 후 전체 재발송 허용 테스트 추가).
- **real-qa vendor enum sweep**: `dispatch-author-plate-real-qa.spec.ts` 의 free-text `driverSource: '경기퀵'` → `'GYEONGGI_QUICK'` (BE enum 강제 후 400 회귀 방지). 모바일 `DispatchBoardScreen` 의 MODIFICATION_ACCEPTED isEditMode '수정 배차 완료' 구 라벨 + 데스크톱 `VehicleGroupColumn` 동일 잔재 제거 (D-DMR-01 재배차 모델 정합).
- **수동완료 도달성**: `VehicleGroupColumn.canOpenDetail` 을 전 상태로 확장 — DRAFT/DISPATCHING 보드에서 상세 모달의 [기사/차량 입력] + [수동 발송완료] 도달 (spec § 8). readOnly 는 배차현황 한정.

### P2

- `useDispatchTask.ts`: BE 슬림 ack(`DispatchTaskSlimResponse` 신설) 를 상세 cache(보드 task UUID key + 배차현황 arologisDispatchId key) 에 병합하는 헬퍼 추가. start-redispatch 는 그룹 PENDING / slip UNDISPATCHED / matchedDrivers 초기화 transform 동반 → DRAFT 복귀 즉시 반영. 수정/취소 요청도 동일 병합 + 배차현황 목록 invalidate.
- `DispatchTaskDetailModal`: 그룹 단위 발송상태 배지(`dispatch-task-detail-group-{seq}-dispatch-status`, 보드 카드와 동일 라벨/톤) 추가 — 재배차 복귀를 모달 레벨에서 검증 가능.
- mock: `syncMockDispatchTaskSummary` 로 수정요청/재배차/수동완료/발송 후 배차현황 summary status 동기 (재배차 후 arologisDispatchId null 화 대응 — 매칭 키 taskCode).
- 신규 Playwright `dispatch-board/dispatch-modification-redispatch.spec.ts` 3 케이스 (배차현황 경유 수락→재배차 / 거부 배너 / 보드 수동완료 모달 단언). `dispatch-completed-history.spec.ts` 조회전용 단언 역전 (UPDATE 노출 / VIEW 미노출, 코멘트 조회 전용 유지).

### 회귀 fix (Round C 자가검증 중 적발)

- `DispatchRedispatchManualPolicyIT` (Round A 신규, MockMvc 커밋형 — rollback 없음) 가 seed 한
  2099-06-13/15 DRAFT task 가 `DispatchTaskRepositoryIT.findByDispatchDateBetween_filters_date_and_status`
  의 2099-06-13~15 조회창을 오염해 풀 스위트에서 1건 실패 (959 중 1, 순서 의존 flake).
  seed 날짜를 자유 창인 2099-08-12~15 로 이동해 격리.

### 알려진 한계 (defer)

- 배차현황 상세 query key 가 `arologisDispatchId` 라서 재배차 직후(null 화) 그 key 의 refetch 는 404 가 난다. 병합으로 화면은 정합 유지되며, invalidate 는 task UUID key 만 수행한다. 상세 key 의 task UUID 통일은 후속.
- 배차현황 상태 필터는 DISPATCHED 단일 유지(기존 계약) — 수정요청 중(MODIFICATION_*) task 의 목록 노출 확장은 후속 슬라이스.
