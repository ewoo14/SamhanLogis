# #787 잔여 — EditLockGuard 잠금메시지 raw enum 누출 제거 (displayName SSOT, #791)

- **일자**: 2026-07-11
- **PR**: #791 · **연관 Issue**: #787(부분 해결, 전체 close 아님)
- **계열**: #786/#788(raw enum→displayName)·#789(Tier2 500)·#790(인쇄라벨) 동일 #787 잔여 계열의 shared 잠금 abstraction 편.
- **워크플로우**: Codex 구현 → Opus 5-agent(+실HTTP·라이브 standalone QA) → fix → Codex 5-agent 적대 → 0수렴 → CI → 머지.

## 결함
shared `DefaultEditLockGuard.guard()` 가 `"현 단계 (" + status + ")"` 로 메시지 생성 → generic `T`(도메인 status enum)의 `toString()`=raw enum명(CONFIRMED/SHIPPING/PLANNED 등)이 사용자 노출 `LockedException` 메시지에 누출. 14 service 공통 잠금 경로. (LockedException은 이미 409라 500 마스킹 아닌 **메시지 품질** 결함.)

## 구현 (opt-in displayName 함수)
| 대상 | 변경 |
|---|---|
| `EditLockPolicy<T>` (shared) | nullable `displayNameFn` + builder `.displayName(fn)` + `displayName(status)` 접근자(미지정 시 `String.valueOf` fallback, 비파괴적) |
| `DefaultEditLockGuard` | 3개 메시지 `status` → `policy.displayName(status)` |
| 11개 정책 | `.displayName(XxxStatus::getDisplayName)` — accounting(TaxInvoice/Journal/Period/CashReceipt)·arologis(Dispatch)·dc-config·inventory(Audit)·partner-order·partner·product·user |
| `DispatchDerivedStatus` | displayName 부재 유일 → SSOT 신설 **배송 전/배송중/배송완료** |
| 추가 sweep | `EditRequestRecord`(consumeApproval/requirePending: "APPROVED"/this.status → "수락"/getDisplayName)·`ArologisEditRequestService`(hardcoded PLANNED)·`ProductEditRequestService`(raw s) |
| 테스트 | `DefaultEditLockGuardTest` displayName 경로+fallback 회귀 신설, arologis/inventory LockPoliciesTest assert 갱신 |

## 리뷰 disposition
- **Design(Medium)**: `배차중`이 기존 SSOT(SlipStatusBadge SHIPPING=`배송중`) 및 slip-service "배차"(차량매칭) 용어와 충돌 → **배송 전/배송중/배송완료**로 통일(전-중-완료 일관, "배차" 모호성 제거). 채택.
- **BE F1(P1)**: `EditRequestRecord`(同 모듈) raw enum 누출 → 이 PR서 fix(EditRequestStatus SSOT 활용).

## 검증
- **QA genuine**: shared + 8서비스 lock 테스트 `--rerun-tasks --no-build-cache` GREEN. displayName/fallback 회귀 포함.
- **실HTTP 실증**: `InventoryAuditControllerIT`(COMPLETED 취소→409 "현 단계 (완료)…", "COMPLETED" 미노출)·`ProductEditRequestServiceTest`("현 단계 (판매중)…")·`ArologisRealtimeIT`("현 단계 (배송 전)…").
- **라이브 standalone**: 현재 커밋 빌드 arologis jar + 실 Postgres + 실 auth 권한체크 통과 curl → `{"code":"INVALID_INPUT","message":"현 단계 (배송 전) 는 …"}` (raw "PLANNED" 미노출). *(순수 BE 메시지 변경이라 GUI 스샷 대상 없음 — 실HTTP/curl 로 실증, 합성 미생성.)*
- **Codex 적대**: 신규 지적 0. CI green.

## 후속 sweep (#792 — 드롭 아님, 동일 #787 계열)
BE 전수 sweep가 **동일 결함(shared base class raw enum 상태메시지)**을 추가 포착. 별도 모듈이라 후속 PR로 분리:
- **F2(P1)** `shared/approval-core` `ApprovalLineBase:150`·`ApprovalStepBase:161` + groupware `ApprovalLine:178` — `ApprovalStatus`/`ApprovalStepStatus` displayName **신설** 필요. groupware ApprovalLineService approve/reject/withdraw→GEH verbatim.
- **F3(P1)** `shared/collab-core` `CollabSuggestionRecord:128` — `CollabSuggestionStatus` displayName **신설** 필요. 6개 collab 소비자 accept/reject/withdraw.
- **F4(P2)** `JournalExcelExportService:91-96` switch(작성중/게시완료/역분개완료) ↔ `JournalStatus.getDisplayName()`(임시저장/확정/역분개) 불일치(pre-existing).

## 참고 (QA 정직 관찰)
11개 배선 중 오늘 실 HTTP 도달=inventory 실사취소·arologis 배차 edit-request·product edit-request 3개. 나머지는 선제 배선(mutation 엔드포인트 미소비)—결함 아님, 누출 예방.
