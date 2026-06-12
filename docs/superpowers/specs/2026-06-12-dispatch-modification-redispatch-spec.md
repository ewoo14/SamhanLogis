# SPEC — 배차 #3: 수정제안(suggestion) mutation 완결 + 재배차 루프 + 수동기입 정책

> 2026-06-12. 배차 보드 고도화 에픽([2026-06-11-dispatch-board-enhancement-spec.md](2026-06-11-dispatch-board-enhancement-spec.md)) #3 슬라이스.
> 개발책임자 "1,2,3,4 순서대로 진행" — #1(2축 차량, #470)·#2(2-pane 보드, #471) 머지 완료 → #3.
> 정책 근거: 에픽 spec §3(전송 후 수정)·§5(Google Docs 협업 = 수정제안 모드)·§8(타사 수동기입).

---

## 0. 핵심 결론 (정찰 박제)

배차 도메인 = `slip-service` 안. 수정/취소 상태머신(Phase C)과 그룹 발송상태(#2 V42)는 **대부분 기성**이나, **재배차 루프가 끊겨 있다**(핸드오프 ⚠️ #2 후속 의무).

| 자산 | 상태 | 근거 |
|---|---|---|
| `DispatchTaskStatus` 11값(MODIFICATION_*·CANCEL_*) | ✅ 기성 | `domain/dispatch/DispatchTaskStatus.java:42-53` |
| `DispatchTask` 전이 메서드 11종 | ✅ 기성 | `domain/dispatch/DispatchTask.java:91-230` |
| `markBackToDraftForRedispatch()` (MODIFICATION_ACCEPTED→DRAFT, arologisDispatchId=null) | ⚠️ **정의만, 호출자 0** | `DispatchTask.java:222` |
| 수정 요청/수락/거부 service+endpoint | ✅ 기성 | `service/dispatch/DispatchTaskModificationRequestService`·`...DecisionService`, `web/dispatch/DispatchTaskAdminController`·`...InternalController` |
| 그룹 발송상태 PENDING/DISPATCHED + V42 | ✅ 기성(#2) | `DispatchVehicleGroupDispatchStatus.java`, `V42__dispatch_group_dispatch_status.sql` |
| `DispatchVehicleGroup.markDispatched()` | ✅ 기성 | `DispatchVehicleGroup.java:115` |
| `DispatchVehicleGroup.resetToPending()` (DISPATCHED→PENDING) | ❌ **부재** | — |
| 수동기입 service `DispatchMatchedDriverManualService.setMatchedDriver()` | ✅ 기성(upsert만, **status 게이트 없음**) | `service/dispatch/DispatchMatchedDriverManualService.java:37` |
| `MatchedDriver.driverSource` (vendor) | △ String(자유값, enum/CHECK 없음) | `domain/dispatch/MatchedDriver.java:52` |
| `ArologisDispatchClient` cancel/delete | ❌ **부재**(재배차 시 기존 dispatch 처리 갭) | `client/ArologisDispatchClient.java` |
| FE `ModificationRequestDialog`·`CancellationRequestDialog`·`VehicleGroupCard`·`DispatchCommentThread` | ✅ 기성 | `clients/desktop/src/renderer/routes/dispatch-board/components/` |

### 🐞 재배차 끊김 (이번 슬라이스가 닫는 핵심 버그)
편집 작업(`assignSlip`/`removeSlipFromGroup`/`reorderSlips`)은 **모두 `group.isDispatchPending()` 가드**(`DispatchTaskService.java:131,161,184`). 발송(`DispatchTaskCompletionService.dispatch()`)은 **PENDING 그룹만 필터**(`:86`). 따라서 `markBackToDraftForRedispatch()` 가 task 만 DRAFT 로 돌리고 **그룹을 PENDING 으로 리셋하지 않으면**:
- 편집 불가(그룹이 DISPATCHED).
- 재발송 시 `targetGroups` 빈 목록 → `INVALID_INPUT "발송할 미발송 차량 그룹이 없습니다"`(`:88-90`).
→ **재배차 영구 불가.** 그러므로 markBackToDraftForRedispatch 배선 시 **그룹 dispatchStatus PENDING 리셋 동반 필수.**

---

## 1. 범위 (IN)

### 1-1. BE — 재배차 루프 폐쇄 (CRITICAL)
1. `DispatchVehicleGroup.resetToPending()` 추가: DISPATCHED→PENDING 전이(이미 PENDING 이면 no-op 또는 그대로). 도메인 메서드 체인(직접 set 금지).
2. **재배차 진입 service + endpoint** (신규, 예: `DispatchTaskRedispatchService` + `POST /admin/dispatch-tasks/{taskId}/start-redispatch`):
   - `task.markBackToDraftForRedispatch()` (MODIFICATION_ACCEPTED→DRAFT, arologisDispatchId=null) — 비-MODIFICATION_ACCEPTED 는 409.
   - 해당 task 의 **발송됐던(DISPATCHED) 그룹 전부 `resetToPending()`** + 매핑 slip 의 dispatchStatus 를 편집 가능 상태로 되돌림(현 `assignSlip` 은 slip `UNDISPATCHED` 만 허용 — 재배차 slip 의 상태 전이 일관성 확보. Slip 도메인 전이 메서드 확인 후 적정 처리).
   - **arologis 기존 dispatch 처리**: `ArologisDispatchClient` 에 cancel/soft-delete 메서드 추가 → arologis-service 측 Dispatch soft-delete(delete-recreate, D-DC-04). arologis-service 수신 endpoint 동반 필요 여부 확인. **양 서비스 무연동(로컬) 시 graceful**(notification 패턴처럼 try/catch + 경고 로그) — 재배차 자체는 진행.
   - 이후 기존 `DispatchTaskCompletionService.dispatch()` 재호출 경로로 arologis **재발송** → 새 arologisDispatchId.
3. **편집 허용 상태 명문화 + 가드 메시지 일관**: 그룹 조립 편집은 task DRAFT + group PENDING. MODIFICATION_ACCEPTED 는 start-redispatch 통과 후 편집. deny 케이스 BusinessException(409/400) 통일.

### 1-2. BE — 수동기입 task-status 게이트 (§8)
4. **vendor enum 도입**: `MatchedDriver.driverSource` 자유 String → vendor 식별 표준화. enum 후보 `AROLOGIS`/`GYEONGGI_QUICK`(경기퀵)/`JEONGUK_HWAMUL`(전국화물)/`OTHER`. **DB CHECK 제약 추가 시 Flyway 마이그레이션 동반 필수**([[enum-expansion-check-constraint]]) — 영속 enum 값은 CHECK(IN) 마이그 없으면 실 INSERT 거부.
5. **수동기입 게이트**: `DispatchMatchedDriverManualService.setMatchedDriver()` 확장 — 어느 task/group 상태에서 수동기입 허용할지 가드(편집 가능 + 발송 흐름 상태). 타사(경기퀵/전국화물) = arologis 자동 연동 불가 그룹 → 배차담당자가 기사·차량 직접 기입 후 **그룹/배차상태 수동 "발송완료" 표시**(§8 "배차상태 수동 업데이트"). 수동 발송완료 전이 경로 + 가드.
6. **arologis multi-dispatch-id 정밀 전이 (검토 + 최소 fix)**: 현재 task 단일 `arologisDispatchId`(confirm 시 set, `DispatchTaskCompletionService` 는 발송 응답 id 미저장 — `:103-104` 로그만). 부분 발송(#2 그룹 단위)·재배차 시 dispatch-id 추적이 부정확. **#3 범위 = 재배차 delete-recreate 시 기존 id 명시 처리 + 모순 없는 단일-id 동작 보장**. 그룹별 dispatch-id 정밀 테이블화는 후속(검토 결과 박제).

### 1-3. FE (clients/desktop)
7. **수정제안 → 재배차 흐름 UI**: DISPATCHED task [수정 요청](기성 `ModificationRequestDialog`) → 상태 뱃지(수정요청중/수정수락/수정거부) → MODIFICATION_ACCEPTED 시 **[재배차 시작]** 버튼 → start-redispatch → 편집 → [배차 완료](기성 `DispatchCompleteDialog`) 재발송. MODIFICATION_REJECTED 시 거부 사유 표시.
   - arologis 수락/거부는 internal endpoint(시스템간) — FE 는 상태 표시 + refetch/invalidate(react-query). **실시간 SSE 는 E5 별도** — #3 은 mutation 후 invalidate 수준.
8. **수동기입 UI 정밀화**: `VehicleGroupCard`/캡슐에 타사 기사·차량 기입(driverName/phone/plate/**vendor 선택**) + 수동 발송완료 표시·색상.
9. **Mock 핸들러**: start-redispatch, 수정 결정(수락·거부 시뮬), 수동기입 vendor·상태 게이트. [[inprocess-mock-principles]] 3원칙 준수(parseMockBody·non-null envelope·blob). DataTable/Modal testid forward 확인.

### 1-4. 테스트 + QA
10. **BE IT**(Testcontainers): 재배차 루프 happy(DISPATCHED→수정요청→수락→start-redispatch[**그룹 PENDING 리셋 단언**]→편집→재발송→새 id) + deny(비-ACCEPTED start-redispatch 409·발송그룹 편집 409) + 수동기입 게이트(허용/거부 상태·vendor enum CHECK 실 INSERT) + multi-id 재배차. [[enforcement-real-http-test]] 계약 바뀐 축 실 HTTP.
11. **FE mock 단위 테스트**(Playwright, desktop cwd, [[playwright-local-version-skew]]). 변경 모듈 **전체 suite 완주**([[changed-module-full-test-before-push]]).
12. **Docker 실서버 QA + 스크린샷**(각 리뷰 라운드, [[temp-multimodel-workflow]]·[[qa-docker-real-test]]·[[real-server-check-screenshot]]): 실 게이트웨이 :8080 + dev_master 로그인, VITE_MOCK_MODE off. 재배차 루프 실 화면, 수동기입 실 화면.

---

## 2. 범위 밖 (DEFER — 명시)
- **전체 audit-count-revert UI**(입출고전표 동형 수정이력/회귀, `SlipAuditLog` 재사용) = **E3 별도**. #3 은 mutation 흐름만.
- **실시간 SSE 양방향 협업**(삼한↔아로로지스) = **E5 별도**.
- **코멘트/제안 단위 협업 플랫폼**(§7 전역) = **#4 별도**(신규 세션 권장). `DispatchCommentThread` 기성은 유지.
- **영업 취소 → 취소선 + arologis 취소 연동** = **E4 별도**(취소 BE service 는 기성, FE 취소선은 후속).
- **vendor MANUAL 덮어쓰기 우선순위** = **#467 DEFER**(제외).
- **그룹별 dispatch-id 정밀 테이블화** = 후속(#3 은 검토 결과만 박제).
- 다중 vendor 차종·지역 라우팅 / 배차안내 SMS feed = §8 후속.

---

## 3. 컨벤션 가드 (의무)
- BaseEntity 7 audit + Soft Delete only. 도메인 메서드 체인(직접 set 금지). 한국어 Javadoc.
- UUID 사용자 비공개 — taskCode/슬립번호만 노출([[uuid-no-user-visibility]]).
- 전표/배차 번호 = `YYYY/MM/DD-N` 슬래시([[slip-order-number-format]]).
- 게이트웨이 라우팅: 신규 endpoint 는 `api-gateway application.yml` no-strip 라우트 등재 확인(/admin/dispatch-* 계열 기성 — start-redispatch·수동기입 경로 커버 여부 대조). FE URL 만으로 BE 추정 금지.
- enum 확장 = CHECK 제약 마이그레이션 동반([[enum-expansion-check-constraint]]).
- Codex 구현([[codex-implements-claude-reviews]]) — Claude 직접 코드 금지(spec/plan/git/gh 예외). Claude commit 대행([[codex-sandbox-git]]).

## 4. 결정 코드 (DECISIONS 박제 예정)
- D-DMR-01 재배차 진입 = 전용 endpoint(start-redispatch) — markBackToDraftForRedispatch + 발송그룹 resetToPending 원자.
- D-DMR-02 수동기입 vendor = enum + CHECK 마이그, 타사 수동 발송완료 게이트.
- D-DMR-03 arologis 재배차 = delete-recreate, 무연동 graceful.
- D-DMR-04 #3 범위 = mutation 흐름; audit-UI(E3)·SSE(E5)·코멘트(§7)·취소선(E4) defer.
