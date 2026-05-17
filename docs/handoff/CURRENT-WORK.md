# 현재 작업 핸드오프 노트

> 회사 PC 첫 세션 시작 시 본 파일만 읽으면 즉시 컨텍스트 복원 가능.

## 2026-05-18 SP-08-5-4 진입 — C1 검수 CTA 회귀 + InboundInspection 흐름 검증

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-4-purchase-inspection-cta-regression
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `211711a1` (PR #222 SP-08-5-3 squash merge)
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.4
- 사용자 6/7회차 정책 — PR 내 모든 결함 해결 + PM 자동 머지 + 자동 진입

### SP-08-5-4 범위 (C1)

- 회귀 검증: SP-03 구매관리 CTA 가 `SAVED / CONFIRMED` 행에 유지되는지
- `InboundInspectionDialog` 저장/완료 성공 후 구매관리 query refetch 유지
- inventory-service endpoint path 직접 `/api/v1` 와 gateway strip 양쪽 경로 회귀
- Playwright 정적 spec + IT (필요 시) + QA PNG 회귀 mock
- 신규 코드 변경 최소화 — 회귀 안전 가드 추가가 주

### 직전 머지 (PR #222)

- branch: `feat/sp-08-5-3-purchase-slip-soft-delete` (deleted)
- mergeCommit: `211711a1`
- 사이클 통계: N=2 종료 (양쪽 Claude+Codex 모두 APPROVE)
- TM PR comment 4건 (Claude/Codex 각 사이클 1+2)
- 신규: SlipDeleteController/Service/Request, Slip.deleteForPurchase, SlipDeleteIT 10 case, ErrorCode SLIP_DELETE_INSPECTION_COMPLETED + SLIP_DELETE_NON_INBOUND, `.danger-banner`/`.danger-text` CSS, 422 alert→banner state

### 다음 후보

- SP-08-5-5 P1 매입 인쇄 양식
- SP-08-5-6 통합 검증 또는 누적 5 PR 대체

## 2026-05-18 SP-08-5-3 머지 완료 — 매입 soft delete (참고 이력)

## 2026-05-18 SP-08-5-3 진입 — 매입 soft delete + InboundInspection 연계

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-3-purchase-slip-soft-delete
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `61925942` (PR #221 SP-08-5-2 squash merge)
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.3
- 사용자 6/7회차 정책: PR 내 모든 문제 본 PR 안에서 해결, PM 자동 머지 후 다음 슬라이스 자동 진입.

### SP-08-5-3 범위 (D1)

- BE: `DELETE /api/v1/slips/{id}` 매입 soft delete (`Slip.markDeleted()` 컨벤션 재사용)
- hard delete / orphan removal 금지 — BaseEntity Soft Delete only
- 권한: `WAREHOUSE / MANAGER / MASTER`; `INVENTORY / SALES / ACCOUNTANT` 403
- 낙관적 잠금: SP-08-5-2 와 동일 패턴 (request `updatedAt` 또는 `version` 기반)
- 연결 `InboundInspection` 정책:
  - 검수 완료 (`InspectionStatus.COMPLETED`) 매입은 삭제 차단 → ErrorCode `SLIP_DELETE_INSPECTION_COMPLETED` 422
  - 미완료 상태 (`PENDING/IN_PROGRESS`) 는 같이 cascade soft-delete 또는 차단 (master plan 결정 시 BE agent 가 정책 결정)
- audit log: `SLIP_DELETE` revision 1건 기록
- FE: 매입 상세 화면 "삭제" CTA (권한 + status 가드) + 확인 dialog + 삭제 후 목록 이동
- QA: `docs/qa/sp-08-5-3-purchase-slip-soft-delete/screenshots/` 4장
  - 삭제 확인 modal
  - 검수 완료 차단 alert
  - 삭제 성공 + 목록 갱신
  - 권한 가드 (INVENTORY 버튼 미렌더)

### 머지 완료 직전 슬라이스 (PR #221)

- branch: `feat/sp-08-5-2-purchase-slip-edit-put` (deleted)
- mergeCommit: `61925942`
- 사이클 통계: N=2 종료 (양쪽 5+5 = 10 agent APPROVE, CI 24/24 SUCCESS)
- TM PR comment 4건 발행 (Claude 사이클 1 + Codex 사이클 1 + Claude 사이클 2 + Codex 사이클 2)
- 신규 추가: warning/danger scale 토큰 (CSS + TS mirror), purchase-edit-* CSS 클래스, SlipUpdateService/Request/Controller/IT + Slip 도메인 INBOUND ordering

### 다음 후보 (SP-08-5-3 머지 후)

- SP-08-5-4 C1 검수 CTA 회귀 + InboundInspection 흐름 검증
- SP-08-5-5 P1 매입 인쇄 양식

## 2026-05-18 SP-08-5-2 머지 완료 — 매입 수정 direct PUT (참고 이력)

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-2-purchase-slip-edit-put
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `0d621b36`
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.2
- 사용자 6/7회차 정책: PR 내 모든 문제 해결, PM 자동 머지 후 다음 슬라이스 자동 진입. 단 현 세션은 사용자 지시에 따라 commit까지만 수행하고 push는 Claude가 처리한다.

### SP-08-5-2 범위

- BE: `PUT /api/v1/slips/{id}` direct edit endpoint. gateway strip 기준 controller path는 `/slips/{id}`.
- 대상: `Slip(type=INBOUND)` 매입 전표만 수정 가능.
- 권한: `WAREHOUSE / MANAGER / MASTER`; `INVENTORY / SALES / ACCOUNTANT`는 403.
- 낙관적 잠금: request `updatedAt`과 현재 `modifiedAt` 또는 `createdAt` fallback 비교. JPA `@Version`은 기존 `slips.version` 컬럼을 재사용한다.
- 라인 검증: 잘못된 라인은 422 `SLIP_UPDATE_INVALID_LINE`.
- 감사: direct PUT 성공 시 `SLIP_EDIT` audit revision 1건 기록.
- FE: 매입 상세 화면 수정 Modal, 409 “최신 내용 불러오기” 배너, audit timeline 확인.
- QA: `docs/qa/sp-08-5-2-purchase-slip-edit-put/screenshots/` 4장.

### 다음 후보

- SP-08-5-3 매입 soft delete + InboundInspection 정합.
- SP-08 회계/vendor OCR/Aligo 후속 parity.

## 2026-05-17 SP-08-5-1 Codex 진입 — 매입 목록·상세 endpoint 잠금

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-1-purchase-slip-list-detail
git status --short
```

### 현재 main HEAD

```
d5c3d573 [FEAT] SP-08-4-4 주문 인쇄 양식 endpoint + 인쇄 미리보기 UI (#219)
e065ed43 [FEAT] SP-08-4-3 주문 soft delete + 견적→주문 변환 endpoint (#218)
0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)
f8f2c447 [FEAT] SP-08-4-1 주문 목록·상세 endpoint 잠금 (#216)
```

### SP-08-4 시리즈 완료

| 슬라이스 | 상태 | PR | 머지 commit |
|---|---|---|---|
| SP-08-4-1 주문 목록·상세 | 완료 | #216 | `f8f2c447` |
| SP-08-4-2 주문 수정 direct PUT | 완료 | #217 | `0ead89bd` |
| SP-08-4-3 주문 soft delete + 견적→주문 변환 | 완료 | #218 | `e065ed43` |
| SP-08-4-4 주문 인쇄 양식 | 완료 | #219 | `d5c3d573` |

### SP-08-5 master plan

- 신규 plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md`
- 매입 도메인: 별도 `PurchaseSlip` 없음. `slip-service` `Slip(type=INBOUND)` 사용.
- 입고 검수 도메인: `inventory-service` `InboundInspection`.
- SP-03 구매관리 검수 CTA 회귀 검증은 모든 SP-08-5 슬라이스 필수.

### SP-08-5-1 현재 범위

- R1 `GET /api/v1/slips?type=INBOUND&from=&to=&page=&size=` alias 보강.
- R2 `GET /api/v1/slips/{id}` INBOUND 상세에 `inspectionStatus` 보강.
- 권한: `WAREHOUSE / MANAGER / MASTER`; `INVENTORY` 제외.
- IT: `SlipQueryPurchaseIT` 5 case.
- 정적 계약: `clients/desktop/playwright/sp-08-5-1-purchase-slip-list-detail/`.
- QA PNG: `docs/qa/sp-08-5-1-purchase-slip-list-detail/screenshots/`.

### SP-08-4 후속 백로그

- SP-08-4-5 통합 리뷰는 PR #216~#219 누적 완료로 대체 가능하나, 필요 시 주문 CRUD 운영 QA만 별도 수행.
- FE-C2-01 `partnerCode` editability 정책.
- FE-C2-03 수정 후 목록 queryKey invalidate.
- DevOps D-1 `FixtureEstimateClient` `@Profile` Phase 11.
- DevOps D-2 `nextOrderNo` soft-delete row 제외 식별자 정책.
- QA-Nit-02 `resolveActorName` Javadoc.

---

## 2026-05-17 SP-08-4-3 머지 완료 (PR #218) + SP-08-4-4 자동 진입

### 즉시 시작 (회사 PC 첫 명령)

```powershell
cd C:\dev\SamhanLogis
git checkout main; git pull origin main
git checkout feat/sp-08-4-4-order-print-form 2>$null
# 또는 main 에서 다시 시작 시:
# git checkout -b feat/sp-08-4-4-order-print-form
```

**PM 자동 진입 정책** (사용자 명시 2026-05-17): 명령 없이 다음 슬라이스 SP-08-4-4 자동 시작. blocker/UNSTABLE 시만 사용자 대기.

### 현재 main HEAD (2026-05-17 누적)

```
e065ed43 [FEAT] SP-08-4-3 주문 soft delete + 견적→주문 변환 endpoint (#218)
0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)
f8f2c447 [FEAT] SP-08-4-1 주문 목록·상세 endpoint 잠금 (#216)
601f1891 [FEAT] SP-08-3-4 배차문자 preview+send+audit 저장내역 (#215)
e165ce24 [FEAT] SP-08-3-3 전표정리 저장내역 2-Tab (#214)
ca5668fd [FEAT] SP-08-3-2 arologis 배차 저장내역 4 화면 일관 (#213)
fa5c7648 [FEAT] SP-08-3-1 배차 GAS parity 기반 잠금 (#212)
```

### SP-08-4 마스터 plan 진행 (docs/planning/2026-05-17_sp-08-4-order-crud-parity.md)

| 슬라이스 | 상태 | PR | 머지 commit |
|---|---|---|---|
| SP-08-4-1 주문 목록·상세 | ✅ 완료 | #216 | `f8f2c447` |
| SP-08-4-2 주문 수정 direct PUT | ✅ 완료 | #217 | `0ead89bd` |
| SP-08-4-3 주문 soft delete + 견적→주문 변환 | ✅ 완료 | #218 | `e065ed43` |
| **SP-08-4-4 주문 인쇄 양식 (legacy GAS 100% 매칭)** | **▶ 진입 중** | TBD | TBD |
| SP-08-4-5 통합 PR + 5-team 리뷰 + 머지 | 대기 | TBD | TBD |

### 사용자 정책 누적 (1~5회차 + α)

| 회차 | 정정 내용 | 메모리 위치 |
|---|---|---|
| 1회차 | Claude 5 + Codex 5 양쪽 reviewer | `feedback_dual_5agent_review.md` |
| 2회차 | Codex CLI MCP (`mcp__codex__codex`) 사용 (Plugin 폐기) | `feedback_codex_plugin_setup.md` |
| 3회차 | TM 통합 2 PR comment / 사이클 (5+5=10 별도 등록 폐기) | `feedback_dual_5agent_review.md` |
| 4회차 | **사이클 N=3 안 완료 의무** (사이클 4+ 진입 금지) | `feedback_dual_5agent_review.md` |
| 5회차 | **사이클 1회 = Claude review → Claude fix → Codex review → Codex fix** (양쪽 각자 fix, 사이클 N.5 통합 fix 폐기) | `feedback_dual_5agent_review.md` |
| α | **PM 자동 머지 + 자동 슬라이스 진입** (blocker/UNSTABLE 시만 대기) | `feedback_user_merge_authority.md` (원본 유지, 본 핸드오프에 정책 명시) |

### 환경 트랩 (반복 발생, 대응 패턴 확립)

| 트랩 | 원인 | 대응 |
|---|---|---|
| Codex sandbox `.git` ACL 차단 | `mcp__codex__codex` workspace-write 가 `.git/index.lock` 생성 거부 | Codex fix 적용만 → Claude 가 직접 `git add/commit/push` |
| Codex sandbox `spawn EPERM` | Playwright `npx`, `electron-vite` build, Node `spawnSync` 차단 | Codex spec 수정만 → CI Linux 검증 위임 |
| PNG 한글 깨짐 (System.Drawing) | PowerShell `Malgun Gothic` GDI+ fallback 실패 | PowerShell unicode escape 방식 + System.Drawing |
| Korean path JDK gradle test | JDK 17 한글 path 실행 trap | Codex sandbox: `GRADLE_USER_HOME=C:\dev\SamhanLogis\.gradle-codex` 대체 |
| `main` 직접 push 차단 | auto mode classifier | 항상 PR 워크플로우 — chore/memory 도 별도 branch + PR |

### 양쪽 review 워크플로우 (사이클 1회 표준 — 5회차 정정 후)

```
1a. Claude 5 subagent 병렬 review (BE/FE/Designer/QA/DevOps)
1b. tech-manager agent 통합 → 1 PR comment (gh pr comment <num> --body-file tm-claude-cycle-N.md)
1c. Claude fix (자체 review + Codex 예상 valid 결함 선제) → commit + push
2a. Codex 5-agent 병렬 (mcp__codex__codex × 5, sandbox=read-only)
2b. tech-manager agent 통합 → 1 PR comment (tm-codex-cycle-N.md)
2c. Codex fix (자체 review + Claude valid 미처리 보완, mcp__codex__codex sandbox=workspace-write)
   → Claude 가 git add + commit + push (.git 차단 대응)
[사이클 N 종료 — 양쪽 0 P0/P1 + CI 24/24 SUCCESS 시 머지]
```

### 다음 슬라이스: SP-08-4-4 P1 주문 인쇄 양식

**범위** (master plan §3.4):
- `GET /api/v1/partner-orders/{id}/print` HTML 양식 (`@media print` CSS)
- legacy GAS `종합견적서` 출력 tab print layout 캡처 → mockup → Edge 캡처 → 3~5회 iteration (`feedback_print_design_iteration.md`)
- A4 한 장 fit, 거래처/품목/단가/합계/날인란
- Playwright + QA PNG (legacy raw vs 우리 양식 side-by-side) + dev-report

**진입 패턴**: codex CLI MCP `mcp__codex__codex` `sandbox: workspace-write` 위임 → 구현 → Claude 직접 `git add + commit + push` → PR 발행 → 사이클 1 review (Claude → Claude fix → Codex → Codex fix) N=3 안 머지.

### 후속 슬라이스 백로그 (SP-08-4 시리즈 누적)

- FE-C2-01 (BE `partnerCode` editability 정책)
- FE-C2-03 (수정 후 목록 queryKey invalidate)
- Codex FE mock coverage
- DevOps D-1 (`FixtureEstimateClient` `@Profile` Phase 11)
- DevOps D-2 (`nextOrderNo` soft-delete row 제외 식별자 정책)
- QA-Nit-02 (`resolveActorName` Javadoc)
- BE P3-2 (IT coverage 43 명시)

---

## 2026-05-17 Codex 진행 (이전 기록) — SP-08-4-3 주문 soft delete + 견적 주문 변환

- 현재 branch: `feat/sp-08-4-3-order-delete-and-estimate-convert`
- 기준 main HEAD: `0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)`
- 범위:
  - `DELETE /api/v1/partner-orders/{id}` soft delete endpoint.
  - `POST /api/v1/partner-orders/from-estimate/{estimateId}` endpoint.
  - `partner_orders.source_estimate_id` nullable + active unique.
  - desktop 주문 상세 `삭제` 버튼 + 확인 Modal.
  - Playwright static contract, QA PNG generator, dev-report/README/ROADMAP/DECISIONS/service README 동기화.
- 정책:
  - 삭제 가능 status는 `DRAFT / CONFIRMING`, `CONFIRMED` 이후는 422.
  - estimate-service 실제 client 부재로 `EstimateClient` port + 기본 empty fixture를 두고, IT는 `@MockBean` snapshot으로 검증.
- 다음 단계:
  - targeted IT, desktop typecheck/lint, Playwright static spec, QA PNG, `git diff --check` 실행.
  - 검증 후 한국어 conventional commit. push는 Claude PM이 처리.

---

## 2026-05-17 SP-08-4-2 머지 완료 (PR #217) + SP-08-4-3 진입

- **현재 main HEAD**: `0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)`
- **SP-08-4-2 완료**: 사이클 6.5 fix + 머지 (사용자 4회차 정정 후 본 PR 예외 — 다음 PR 부터 N=3 제한 엄격 적용)
- **메모리 정정 누적** (PR #217 진행 중 4회차):
  - Claude 5 + Codex 5 양쪽 reviewer (Plugin 1회 통합 폐기)
  - Codex CLI MCP `mcp__codex__codex` 사용 (Plugin 폐기)
  - TM 통합 2 PR comment / 사이클 (각자 5+5=10 별도 등록 폐기)
  - **사이클 N=3 안 완료 의무** (사이클 4+ 진입 금지)
- **다음 슬라이스 SP-08-4-3** (master plan `docs/planning/2026-05-17_sp-08-4-order-crud-parity.md` §3.3):
  - **D1**: `DELETE /api/v1/partner-orders/{id}` soft delete (deletedAt + deletedBy)
  - **C1**: `POST /api/v1/partner-orders/from-estimate/{estimateId}` 견적→주문 변환 정식 endpoint
  - SP-07 견적 source tab 정합 cross-check (Playwright 정적 계약)
- **진입 패턴**: codex CLI MCP workspace-write 자율 dispatch → push → Claude PM PR 발행 → 사이클 1/2/3 양쪽 review + TM 통합 → N=3 안 머지

---

## 2026-05-17 SP-08-3-4 머지 완료 + SP-08-3 시리즈 종료 + SP-08-4 진입 (이전 기록)

- **이전 main HEAD**: `601f1891 [FEAT] SP-08-3-4 배차문자 preview+send+audit 저장내역 (#215)`
- **SP-08-3 시리즈 4 슬라이스 완료**:
  - SP-08-3-1 기반 잠금 (PR #211/#212)
  - SP-08-3-2 arologis 4 화면 (PR #213, `ca5668fd`)
  - SP-08-3-3 slip 전표정리 (PR #214, `e165ce24`)
  - SP-08-3-4 notification SEND_AUDIT (PR #215, `601f1891`) — 사이클 5 (양쪽 0 결함)
- **Codex Plugin 영구 사용 패턴 확정** (commit `9365ec18` chore):
  - `~/.codex/config.toml` `[windows] sandbox = "unelevated"` 필수 (UAC trap 회피)
  - `gpt-5.5 + medium + read-only short prompt` 조합 → 2~3분 완료 (사이클 4/5 첫 plugin 성공)
  - `spark + medium + 복잡 prompt` → collaboration tool wait hang (사이클 3 회피)
  - `scripts/setup-codex-plugin.ps1` + `feedback_codex_plugin_setup.md` + `feedback_codex_model_auto_switch.md` (양 PC 셋업)
- **다음 슬라이스 후보** (SP-08 plan §5 미진행):
  - **SP-08-4** — 주문 CRUD parity (주문 목록/상세/수정/삭제/인쇄/견적→주문 변환 endpoint 잠금)
  - **SP-08-5** — 매입/사입 CRUD parity + SP-03 검수 CTA 회귀
  - **SP-08-6** — 매출/회계 CRUD parity (거래명세서/계산서/일마감/원장 인쇄 양식 GAS 1:1)
  - **SP-08-7** — Notion runtime 의존 zero 정적 잠금 (grep 가드 확장)
  - **SP-08-8** — 자격 평문 비공개 가드 강화
- **진입 패턴**: codex 자율 dispatch → PR 발행 → 사이클 N (Claude + Codex plugin gpt-5.5+medium) → 머지

---

## 2026-05-17 Codex 진행 — SP-08-4-2 Partner Order direct PUT endpoint

- 현재 branch: `feat/sp-08-4-2-partner-order-edit-put`
- 범위:
  - `partner-order-service` `PUT /api/v1/partner-orders/{id}` direct 수정 endpoint.
  - `PartnerOrderUpdateService`, `PartnerOrder.updateHeader`, `PartnerOrder.replaceLines`, `PartnerOrderUpdateRequest`.
  - `updatedAt` 낙관적 잠금 409, 라인 검증 422, audit log 1 revision 기록.
  - 기존 `PartnerOrderEditRequestController` request → approve/reject flow 유지.
  - desktop 주문 상세 수정 modal, 409 최신 내용 안내, audit timeline.
  - Playwright static contract, QA PNG 4장, dev-report, README/ROADMAP/DECISIONS 동기화.
- 로컬 검증:
  - Spring targeted: `PartnerOrderUpdateIT` 6 tests / 0 failed / 0 skipped.
  - desktop typecheck PASS.
  - desktop lint PASS, 기존 warning 2건.
  - QA PNG 4장 생성 PASS.
  - `git diff --check` PASS (CRLF warning only).
  - Codex Windows sandbox에서 Node `child_process.spawn` 자체가 EPERM이라 `npm run build`(electron-vite/esbuild)와 Playwright worker 실행은 환경 차단. `node -e spawnSync('cmd.exe')`도 EPERM으로 재현됨.
- 다음 단계:
  - branch push 후 Claude PM이 PR 생성 + CI/Linux에서 Playwright/build 확인.

---

## 2026-05-17 Codex 최신 핸드오프 — SP-08-3-4 배차문자 저장내역 구현 (✅ 머지 완료 - PR #215)

- 현재 branch: `feat/sp-08-3-4-dispatch-sms-history`
- 기준: PR #214 merge 후 `e165ce24`.
- 범위:
  - `notification-service` `dispatch_sms_save_history` entity/repository/service/controller/DTO/Flyway V4.
  - `/admin/notifications/dispatch-sms/history` POST/list/detail/latest 4 endpoint.
  - `SEND_AUDIT` append-only 저장 모드 추가. 미리보기는 `AUTO_LATEST`/`MANUAL_NAMED`, 실발송 감사는 `SEND_AUDIT`로 보존한다.
  - desktop 배차문자 화면 실행/저장내역 2탭, latest 자동 복원, 명시 저장, 이중 confirm 발송, 발송 후 audit 저장.
  - `clients/desktop/playwright/sp-08-3-4-dispatch-sms-history` static/mock contract.
  - QA mock PNG generator `scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1`.
- 다음 단계:
  - 전체 backend/frontend/Playwright 회귀 검증.
  - QA PNG 생성, `git diff --check`, secret/UUID/Notion scan.
  - 한국어 conventional commit 분리 후 push. Claude PM이 PR 생성/CI/5-team cycle을 이어간다.

---

## 2026-05-17 Codex 최신 핸드오프 — SP-08-3-3 전표정리 저장내역 구현

- 현재 branch: `feat/sp-08-3-3-slip-cleanup-history`
- 기준: PR #213 merge 후 `ca5668fd`.
- 범위:
  - `slip-service` `slip_cleanup_save_history` entity/repository/service/controller/DTO/Flyway V25.
  - `/slips/cleanup/history` POST/list/detail/latest 4 endpoint.
  - `/sales/slip-cleanup` 실행/저장내역 2탭, latest 자동 복원, 명시 저장, row click 복원.
  - `clients/desktop/playwright/sp-08-3-3-slip-cleanup-history` static/mock contract.
  - QA mock PNG generator `scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1`.
- 다음 단계:
  - 전체 frontend lint/build 및 Playwright 회귀.
  - QA PNG 생성, `git diff --check`, secret/UUID/Notion scan.
  - 한국어 conventional commit 분리 후 push.

---

## 2026-05-17 Codex 최신 핸드오프 — SP-08-3-2 아로로지스 배차 저장내역 구현

- 현재 branch: `feat/sp-08-3-2-arologis-dispatch-history`
- 기준: SP-08-3-1 이후 arologis 4 화면 history 실제 구현.
- 범위:
  - `arologis-service` `dispatch_save_history` entity/repository/service/controller/DTO/Flyway V12.
  - `/admin/arologis/dispatches/history` POST/list/detail/latest 4 endpoint.
  - `clients/arologis-desktop` 가배차 권역/지방가배차/미배차/운송사 비교 화면의 실행/저장내역 2탭, latest 자동 복원, 명시 저장, row click 복원.
  - `clients/desktop/playwright/sp-08-3-2-arologis-history` static/mock contract.
  - QA mock PNG generator `scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1`.
- 다음 단계:
  - 전체 frontend lint/build 및 Playwright 회귀.
  - QA PNG 생성, `git diff --check`, secret/UUID/Notion scan.
  - 한국어 conventional commit 분리 후 push.

---

## 2026-05-16 Codex 최신 핸드오프 — SP-08-3-1 배차 legacy GAS parity 기반 잠금

- 현재 branch: `feat/sp-08-3-1-dispatch-parity-base`
- 기준 main: PR #211 merge commit `ce947fe8`.
- 첫 commit: `docs(sp-08-3-1): SP-08-3 배차 GAS parity 기획서`.
- 범위:
  - `docs/planning/2026-05-16_sp-08-3-dispatch-legacy-gas-parity.md`를 마스터 기획서로 커밋.
  - `clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts`로 6 endpoint matrix, UUID literal zero, Notion runtime call zero, secret-like marker zero를 정적 계약화.
  - `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1`와 `docs/qa/sp-08-3-dispatch-parity/` QA 산출 추가.
  - `docs/dev-reports/sp-08-3-dispatch-legacy-gas-parity.md` 신규 작성.
  - README / ROADMAP / DECISIONS / SP-08 dev-report / 관련 service README 문서 동기화.
- 범위 밖:
  - SP-08-3-2~4의 Flyway table, controller, UI 2-Tab 실제 구현은 아직 하지 않는다.
  - Aligo 실 API 활성화 없음.
- 다음 단계:
  - 로컬 검증: SP-08-3 단독 Playwright, SP-08-3+SP-08-2+SP-08-1+full-menu 회귀, QA PNG, `git diff --check`, secret/runtime scan.
  - push 후 Claude PM이 PR 생성: `[FEAT] SP-08-3-1 배차 GAS parity 기반 잠금`.

> 갱신일: 2026-05-16 (SP-08-3-1 **배차 legacy GAS parity 기반 잠금 진행**, Codex)
> 갱신자: Codex
> 사용법: 새 도구/세션 시작 시 본 파일 read → §0 (즉시 시작) + §1 (방금 끝난 일) + §3 (다음 trigger 후보) 순서

## 2026-05-16 Codex 최신 핸드오프 — SP-08-2 DPS legacy GAS DB/API parity

- 현재 branch: `codex/sp-08-2-dps-legacy-gas-parity`
- 기준 main: PR #210 merge 후 `af67edde`.
- Claude PM 산출:
  - `docs/planning/2026-05-16_sp-08-2-dps-legacy-gas-parity.md`가 단일 구현 source of truth.
  - 첫 commit `2cdc007f`가 해당 기획서와 Claude brainstorming visual companion용 `.superpowers/` gitignore를 함께 묶었다.
- SP-08-2 구현:
  - `inventory-service`에 `DpsSaveHistory` entity/repository/service/controller/DTO와 Flyway `V11__add_dps_save_history.sql`을 추가했다.
  - `POST /warehouse/audit/dps-history`, list/detail/latest API를 `WAREHOUSE / MANAGER / MASTER` 권한으로 제공한다.
  - `AUTO_LATEST`는 사용자+프로그램별 active 1건만 유지하고 이전 자동 저장 row는 BaseEntity soft-delete 처리한다.
  - `MANUAL_NAMED`는 topic 필수 append-only 저장내역으로 보존한다.
  - desktop `/warehouse/dps-compare`, `/warehouse/dps-compare/by-product`에 `실행 / 저장내역` 2탭, latest 자동 복원 배너, 명시 저장 dialog, row click 복원 UX를 연결했다.
  - `data-testid`는 `dps-history-row-{i}` 등 row index/업무 문구 기반이며 사용자 화면에 UUID를 노출하지 않는다.
  - QA mock PNG generator는 `scripts/generate-sp-08-2-dps-history-screenshots.ps1`, 산출 위치는 `docs/qa/sp-08-2-dps-history/screenshots/`.
- 로컬 검증:
  - `.\gradlew.bat :services:inventory-service:test --tests "*DpsSaveHistory*" --tests "*DpsCompare*" --tests "*DpsByProduct*" --no-daemon --rerun-tasks` PASS — XML 집계 36 tests / skipped 0.
  - `clients/desktop` `npm run typecheck`, `npm run lint`, `npm run build` PASS — lint 기존 warning 2건, error 0.
  - `npx playwright test playwright/sp-08-2-dps-history/sp-08-2-dps-history.spec.ts playwright/sp-08-legacy-gas-db-api-parity playwright/dps-by-product playwright/full-menu-contract --reporter=line` PASS — 29 passed / skipped 0 (`VITE_MOCK_MODE=1`, renderer Vite config, port 5185).
  - `.\scripts\generate-sp-08-2-dps-history-screenshots.ps1` PASS — 7 PNG / non-zero.
  - `git diff --check` PASS — CRLF 안내 warning만 출력.
  - secret-like artifact scan / 신규 FE UUID regex scan / Notion runtime call scan PASS — 0 matches.
- 다음 SP-08 후속 후보:
  - 배차 GAS(가배차/미배차/배차문자/운송사 비교) 저장/복원/preview/send parity.
  - 회계 출력(원장/거래명세서/내일자 전표) `MOCK_DATA` 제거.
  - vendor OCR 2종 UI parity, 알리고 dry-run sync parity.

## 2026-05-16 Codex 핸드오프 — SP-08 legacy GAS DB/API parity

- 현재 branch: `codex/sp-08-legacy-gas-db-api-parity`
- 직전 완료: PR #209 `[codex] SP-07 Google Sheets 견적 주문 원본 계약 정렬` merge commit `1b545a7c`.
- 사용자 최신 확정:
  - 나머지 GAS 코드도 UI와 기능은 기존 그대로 유지한다.
  - Notion 통신/외부 live source만 Samhan Public DB/API로 바꾼다.
  - Notion 데이터는 runtime 조회처가 아니며, 우리 DB로 이관된 뒤 그 DB/API에서 CRUD한다.
- SP-08-1 진행:
  - Claude Code workflow 1단계로 `docs/planning/2026-05-16_legacy-gas-db-api-parity.md` 작성.
  - 5-role 감사(BE/FE/Designer/DevOps/QA) 결과를 반영해 이번 기반 PR 범위를 확정.
  - `clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts` 추가.
  - `estimate-app` 저장 confirm의 `노션에 저장` 사용자 문구를 `Samhan DB에 저장`으로 수정.
  - `order-app` `getOrderSnapshotHistory(safeBizNo, sDate, eDate)` 시그니처를 유지하되 `safeBizNo`는 client-side 호환 인자로만 소비하고 `/partner-orders/drafts?from=&to=` query params로 날짜만 전달.
  - `partner-order-service` draft list endpoint에 optional `from/to` 날짜 필터를 추가하고, 한쪽 범위는 sentinel date 없이 전용 repository method로 분기하며, 기존 caller 호환을 유지.
  - 단톡방/발송금지/배차지역/DC 관리 화면의 사용자 노출 import/source label을 `기존 운영 CSV`, `DB 이관 시드`, `원본 생성`으로 정렬.
  - `scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs` 추가, QA PNG 11장 생성.
- 로컬 검증:
  - `npx playwright test playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts --reporter=line` PASS — 5 tests / skipped 0.
  - `.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderDraftServiceIT" --no-daemon --rerun-tasks` PASS — 3 tests / skipped 0.
  - `clients/desktop` `npm run typecheck` PASS.
  - `clients/web/order-app` `npm ci && npm run typecheck` PASS.
  - `node scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs` PASS — 11 PNG / non-zero.
- 남은 즉시 작업:
  - lint/build/full regression 실행.
  - secret/runtime Notion grep guard 및 `git diff --check`.
  - commit/push/PR 생성, PR 본문에 QA 캡처 11장 인라인 첨부.
  - CI green 확인 후 PM 재점검/merge/branch cleanup.
- 다음 SP-08 후속 후보:
  - DPS 저장내역/품목 pivot DB history/state parity.
  - 배차 GAS(가배차/미배차/배차문자/운송사 비교) 저장/복원/preview/send parity.
  - 회계 출력(원장/거래명세서/내일자 전표) `MOCK_DATA` 제거.
  - vendor OCR 2종 UI parity, 알리고 dry-run sync parity.

- 현재 branch: `codex/sp-07-google-sheets-quote-order-e2e`
- 직전 완료: PR #208 `[codex] SP-06 legacy GAS/Notion DB 이관 정합성` merge commit `e413d82e`.
- 사용자 최신 정정:
  - Notion은 runtime source가 아니라 우리 DB로 이관해야 한다.
  - 모든 Notion 관련 통신/CRUD는 Samhan Public DB/API로 전환한다.
  - 종합견적서/주문서는 Google Spreadsheet 데이터를 그대로 가져오는지 재검증한다.
  - 나머지 GAS 코드는 UI와 기능을 그대로 유지하고, Notion 통신만 DB/API로 바꾼다.
- SP-07 진행:
  - Google Drive connector로 `종합 견적서` spreadsheet (`1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ`) metadata와 safe ranges를 live 확인했다.
  - 27개 tab inventory를 문서화하고, `홈멀티_단가인상`, `싱글 세트_단가인상`, `상업멀티 구성_단가인상` 등 source tab과 `종합견적서`/`전표업로드목록` output form, credential-bearing `전표생성폼`을 분리했다.
  - `partner-order-service` bootstrap `range-map`에서 존재하지 않는 `설정!A1:Z` config read를 제거했다. 거래처 발송 주문서 GAS처럼 base payload + `*_단가인상` helper map을 prefetch하고, config는 V2 seed fallback + DC secret strip만 사용한다.
  - `product-service`는 `*_단가인상`을 ProductMaster 기본 단가로 저장하고 base tab은 `PriceHistory` 인상 전 단가로 보존한다.
  - 새 `priceBasis` UI/API 옵션은 만들지 않는다. legacy UI 기능은 그대로 유지한다.
  - `clients/desktop/playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts`를 추가해 range-map, catalog lookup, product DB sync, 문서/secret guard 계약을 검증한다.
  - `docs/operational-validation/google-sheets-live-source-snapshot.md`, SP-07 spec/plan/dev-report, QA screenshot generator를 추가했다.
  - Claude Code workflow 1단계로 `docs/planning/2026-05-16_google-sheets-quote-order-e2e.md` 기획 문서를 생성했고, Codex가 최신 구현 계약과 대조해 bootstrap/catalog 역할 구분 문구를 보정했다.
  - QA 캡처 6장을 생성했고 01/06 원본 이미지를 직접 확인했다.
- 로컬 검증:
  - RED 확인: SP-07 static contract 문구 assertion 2건이 실제 문서/주석 표기와 달라 실패함을 확인했다.
  - GREEN 확인: `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts --reporter=line` PASS — 7 tests / skipped 0.
  - 병행 계약: `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` PASS — 18 tests / skipped 0.
  - backend targeted tests PASS: `BootstrapServiceTest` / `ProductCatalogLookupClientTest` / `VendorOrderServiceTest` / `VendorOrderControllerIT`, skipped 0.
  - backend targeted tests PASS: `ProductSheetSyncServiceIT` 9 tests, skipped 0.
  - `clients/desktop` typecheck/lint/build PASS. lint는 기존 warning 2건, error 0.
  - `git diff --check` PASS. CRLF 안내 warning만 출력.
- 남은 즉시 작업:
  - commit/push/PR 생성 후 CI watch, green이면 PM 재점검 후 merge/브랜치 정리.
- 다음 후보:
  - SP-08 권한/역할/UUID 비노출 전메뉴 회귀
  - 품목 마스터 7탭 UI
  - Service Account runtime 검증

## 2026-05-16 Codex 핸드오프 — SP-06 legacy GAS/Notion DB 이관 정합성

- branch: `codex/sp-06-legacy-gas-functional-parity`
- PR #208 merge 완료 — `[codex] SP-06 legacy GAS/Notion DB 이관 정합성`.
- 사용자 최신 정정:
  - Notion 데이터를 runtime source로 import해서 쓰는 것이 아니다.
  - Notion 원본 표는 우리 service-per-DB로 그대로 이관하고, 이후 모든 통신/CRUD는 Samhan Public DB 화면/API로 변경한다.
  - 삼한 퍼블릭에서는 단톡방/발송금지/배차지역/DC 이관 내역을 CRUD할 수 있어야 한다.
- SP-06 진행:
  - `clients/desktop/playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts`를 추가해 단톡방/발송금지/배차지역/DC가 각 service DB CRUD와 연결되는지 계약화했다.
  - api-gateway에 no-strip route를 추가했다: `notification-chat-rooms-v1`, `partner-blocks-v1`, `dc-config-admin-v1`, `partner-auth-public-v1`, `partner-auth-approvals-v1`.
  - `tools/operational-validation/import-notion-csv.ps1`를 “DB 이관” 스크립트로 정리하고 `SAMHAN_API_GATEWAY_PORT`/`SAMHAN_*_PORT` override 및 default+100 health fallback을 반영했다.
  - `tools/operational-validation/run-smoke-tests.ps1`가 health 단계에서 탐지한 실제 service port를 gateway/direct endpoint smoke에 재사용하도록 보정했다.
  - `/admin/regions` 사용자-facing 라벨을 `배차지역 관리`로 정리했다.
  - `clients/web/order-app/index.html`에 남아 있던 Notion HTTP endpoint 문자열을 제거하고 legacy 함수명은 DB 로그 RPC(`google.script.run.logFrontEvent`)로 위임했다. `samhanApi.ts`는 legacy 4-인자와 migrated 2-인자 로그 호출을 모두 정규화한다.
  - `partner-auth-service`에 gateway `X-User-*` header auth를 추가해 `partner-approvals` no-strip route가 downstream에서 인증되도록 보정했다.
  - 운영 검증 SQL의 실제 테이블명과 soft-delete active count 조건을 정정했다.
- 로컬 검증:
  - RED 확인: smoke port 계약과 배차지역 관리 라벨 계약, order-app Notion HTTP endpoint 계약이 각각 기존 코드에서 실패함을 확인했다.
  - GREEN 확인: `npx playwright test playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts --reporter=line` PASS — 10 tests / skipped 0.
  - 병행 계약: `npx playwright test playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` PASS — 21 tests / skipped 0.
  - `clients/desktop` typecheck/lint/build PASS. lint는 기존 warning 2건, error 0.
  - backend targeted tests PASS: `PartnerBlock*`, `ChatRoom*`, `Region*`, `DcConfig*`, `partner-auth-service:test`, `api-gateway:test`.
  - Docker/local full stack PASS: `start-local-full.ps1 -SkipDocker` service health UP 15/15.
  - DB 이관 PASS: REGION 20 / DC 213 processed (unique active 210) / CHAT 112 / BLOCK 6, rejected 0.
  - Smoke PASS: service health UP 15/15, endpoint smoke OK 7/7.
  - QA 캡처 9장 생성 및 non-zero 확인 완료.
- 완료:
  - 커밋/push/PR #208 생성, CI green 확인, PM 재점검 후 merge 및 브랜치 정리 완료.
- 다음 후보:
  - SP-07 Google Sheets 견적/주문 E2E
  - SP-08 권한/역할/UUID 비노출 전메뉴 회귀
  - 품목 마스터 7탭 UI

## 2026-05-16 Codex 핸드오프 — SP-05 Samhan Public CRUD 표면 재점검

- branch: `codex/sp-05-samhan-public-crud-audit`
- PR #207 merge 완료 — `[codex] SP-05 Samhan Public CRUD 표면 재점검`.
- 판매관리/구매관리 목록에서 공개 업무번호 기반 `상세` 버튼을 추가하고 `/sales/:id`, `/purchases/:id` 상세 화면으로 명시 진입하게 했다.
- 구매관리 상세 버튼은 기존 `검수` CTA와 공존한다.
- 상세 버튼의 `data-testid`와 aria label은 내부 UUID가 아니라 공개 업무번호(`slipNo`, `YYYY/MM/DD-{순번}`) 기반이다.
- `frontend-feature-inventory.md`, `missing-features-catalog.md`에 2026-05-16 SP-05 현재 상태 블록을 추가했다. 거래처 기본 UI와 구매관리 검수 CTA는 더 이상 “UI 부재”로 표기하지 않는다.
- 검증: SP-05 QA 캡처 8장, desktop typecheck/lint/build, static Playwright contract, Vite mock UI Playwright 완료.

## 2026-05-16 Codex 핸드오프 — SP-04 Samhan Public 전메뉴/legacy GAS/노션 이식 감사

- branch: `codex/sp-04-full-menu-audit`
- 기준 main: PR #205 `[codex] SP-03 Samhan Public 구매관리 검수 CTA와 표시번호 정합화` merge.
- PR #206 merge 완료 — `[codex] SP-04 Samhan Public 전메뉴와 legacy GAS/노션 이식 감사`.
- 사용자 최신 요청:
  - 전메뉴를 전체 점검한다.
  - `/tools/legacy-gas` 안 기존 이카운트 + Google Apps Script 연동 프로그램이 기능 누락 없이 Samhan Public 으로 이식됐는지 확인한다.
  - Notion 단톡방리스트 / 발송금지리스트 / 배차지역 분류표를 참조하며, 해당 데이터를 모두 이식한다.
  - 기존 PR을 확인한다.
  - 종합견적서와 주문서는 Google Spreadsheet 데이터를 그대로 가져오는지 재검증한다.
- SP-04 구현/감사 진행:
  - 기존 PR #115/#117/#118/#119/#120/#163을 legacy GAS/Notion migration 근거로 대조했다.
  - Notion database schema 확인:
    - 단톡방리스트: `이카운트 사업자명`, `카톡방`, `생성 일시`
    - 발송금지리스트: `이카운트 사업자명`, `생성 일시`
    - 배차지역 분류표: `분류 그룹`, `검색어`
  - 로컬 CSV export 현재 row count 를 재검증했다: 배차지역 20 / 거래처 DC 213 / 단톡방 112 / 발송금지 6.
  - `tools/operational-validation/import-notion-csv.ps1` 의 hardcoded 기대 row count 를 제거하고 현재 CSV non-empty row 기준으로 검증하도록 정렬했다.
  - 현재 Notion 단톡방/발송금지 표가 `거래처코드` 없이 `이카운트 사업자명`만 갖는 것을 확인했다. legacy GAS 동작을 보존하기 위해 code-first import 후 lookup miss row 는 `LEGACY-NAME-{hash}` alias 로 저장하고, 내일자 전표/배차안내는 partner name fallback 으로 단톡방/발송금지를 적용하도록 보정했다.
  - DC import 는 로컬 `dc_config_db.partners` seed 가 비어 있어도 CSV `거래처코드`/`업체명`으로 최소 Partner snapshot 을 생성한 뒤 213 rows 를 이식할 수 있게 보정했다.
  - Google Sheets connector로 legacy spreadsheet `종합 견적서` metadata와 핵심 range를 재검증했다. `종합견적서!A1:H20`은 출력 양식이고, 실제 카탈로그 원본은 `홈멀티_단가인상`, `싱글 세트_단가인상`, `상업멀티 구성_단가인상` 등 source tab임을 확인했다.
  - `ProductSheetSyncService`는 tab별 column mapping으로 보정했다. `싱글 세트`/`싱글 구성품`은 C열 모델명, H열 납품가를 사용한다.
  - `ProductCatalogLookupClient`는 `종합견적서!A2:C` flat range 가정을 제거하고, 기존 vendor OCR UI/API를 바꾸지 않은 상태로 `_단가인상` source tab에서 modelCode 단가를 lookup한다. `INTEGRATED_QUOTE_RANGE`는 별도 flat catalog가 있을 때만 override한다.
  - 전메뉴 IA/권한을 보정했다: `/sales/new`, `/purchases/new`, `/transfers/new`, `/sales/link-dispatch`, admin-origin 시트/발송금지/단톡방/지역 화면 route guard.
  - `DISPATCH` 공통 role 을 추가하고 배차/지역 조회 전용 계약에 연결했다.
  - 견적번호/주문번호/재고이동/전표/배차번호를 공개 업무번호 `YYYY/MM/DD-{순번}` 표준으로 정렬 중이다. 판매전표와 구매전표처럼 메뉴/업무 타입이 다르면 같은 날짜 같은 순번을 가질 수 있다.
  - PR 캡처용 SP-04 스크린샷 생성 스크립트와 static Playwright contract 를 추가했다.
- 완료:
  - SP-04 screenshot 12장 생성 및 PR body commit-SHA raw URL 링크 검증 완료.
  - `clients/desktop` typecheck/lint/build + static Playwright contract 완료.
  - targeted Gradle/Google Sheets/import validation + Docker smoke 완료.
  - PR #206 merge 및 미사용 브랜치 정리 완료.

## 2026-05-16 Codex 핸드오프 — SP-03 Samhan Public 구매관리 검수 CTA + 관리형 메뉴/이동번호 정합화

- 현재 branch: `codex/sp-03-purchase-inspection-cta`
- 기준 main: PR #204 `codex/sp-02-samhan-public-ui-gap-audit` merge commit `871e2a10`
- 현재 PR: 생성 예정 — `[codex] SP-03 Samhan Public 구매관리 검수 CTA와 표시번호 정합화`
- 직전 완료:
  - SP-01 거래처 관리 메뉴 권한 정합화 PR #203 merge.
  - SP-02 회계 마감 메뉴 권한 정합화 PR #204 merge.
- 사용자 최신 결정:
  - 전표번호는 전역 unique 가 아니라 메뉴/업무 속성별 날짜 시퀀스다.
  - 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 서로 다른 메뉴값/속성이므로 중복 가능하다.
  - 이동번호/배차번호도 사용자 노출 업무번호로 보고 `YYYY/MM/DD-{순번}` 형식을 따른다.
  - `T-2026/05/04-1`, `TR-20260504-001` 같은 prefix/padding 표기는 정합성 위배이므로 화면/신규 생성/Flyway 정규화 대상이다.
  - UUID는 내부 PK이며 Samhan Public/아로로지스 화면에 표시하지 않는다.
- SP-03 구현:
  - `구매조회` 를 `구매관리` 로 정리하고, `WAREHOUSE / MANAGER / MASTER` 에게 SAVED/CONFIRMED 구매전표 입고 검수 CTA 를 노출한다.
  - 입고 검수 모달은 `InboundInspectionDialog` 를 재사용하고 성공 후 구매관리 목록을 refetch 한다.
  - inventory-service 입고 검수 API 는 gateway strip 후 경로와 직접 `/api/v1/...` 경로를 모두 수용한다.
  - 사이드바/하위 메뉴 표기를 관리형으로 정리했다: `판매관리`, `구매관리`, `재고이동 관리`, `창고 관리`, `견적서 관리`, `주문서 관리`.
  - 예외 메뉴 `주문서 승인`, `거래처 DC 설정` 은 기존 명칭을 유지한다.
  - `StockTransferService` 신규 이동번호를 `YYYY/MM/DD-{순번}` 으로 생성한다. 채번은 같은 날짜의 마지막 numeric suffix + 1이며, Flyway `V10__normalize_stock_transfer_numbers.sql` 로 기존 `T-`/`TR-` 이동번호를 정규화한다.
  - 구매/판매/이동 mock 데이터와 문서 예시는 UUID 대신 공개 업무번호만 표시한다.
- SP-03 로컬 검증:
  - QA 캡처 6장 생성 완료: `docs/qa/sp-03-purchase-inspection-cta/screenshots/01-warehouse-purchase-inspect-cta.png` ~ `06-business-number-uuid-hidden-matrix.png`.
  - QA 캡처 UUID/내부키 문자열 스캔 PASS.
  - Docker Desktop TCP daemon 확인 PASS (`DOCKER_HOST=tcp://localhost:2375`).
  - `clients/web/design-system` `npm run build` PASS.
  - `clients/desktop` Playwright static contract PASS — `6 passed / skipped 0`.
  - Docker/JDK inventory targeted tests PASS — `StockTransferServiceTest 13 tests / skipped 0`, `InboundInspectionControllerIT 10 tests / skipped 0`, `StockTransferControllerIT 5 tests / skipped 0`.
  - Docker/JDK slip targeted tests PASS — `SlipQueryRedesignIT 5 tests / skipped 0`, `SlipQueryRedesignSpecIT 5 tests / skipped 0`.
  - `clients/desktop` `npm run typecheck`, `npm run lint`, `npm run build` PASS. lint 는 기존 SP-03 범위 밖 warning 2건, error 0.
  - `git diff --check` PASS. CRLF 안내 warning 만 출력.
- 남은 즉시 작업:
  - commit/push/PR 생성.
  - PR 본문에 QA 캡처 6장을 raw URL 로 인라인 첨부.
  - `gh pr checks --watch` 후 PM 재점검/머지.
  - 머지 완료 후 병합된 `codex/*` 브랜치 정리.
- 다음 후보:
  - A: Samhan Public 추가 UI 누락 점검
  - B: comments/audit/SSE proxy 확장
  - C: 실제 기기 QA
  - D: Testcontainers no-skip hardening

## 2026-05-16 Codex 핸드오프 — D-AX-22 UUID 비노출 계약 hardening 완료

- branch: `codex/d-ax-22-uuid-free-contract-hardening`
- 직전 완료:
  - D-AX20 Admin 사진 감사/재업로드 후보 PR #200 merge, 원격 브랜치 삭제 완료.
  - D-AX21 업무번호 범위형 표준화 PR #201 merge, 원격 브랜치 삭제 완료.
- 사용자 최신 결정:
  - 전표번호는 전역 unique 가 아니라 메뉴/업무 속성별 날짜 시퀀스다.
  - 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 서로 다른 메뉴값/속성이므로 중복 가능하다.
  - UUID는 내부 PK이며 Samhan Public/아로로지스 화면에 표시하지 않는다.
- D-AX21 완료 요약:
  - `SlipNumberSequence`를 `slipDate + slipType` 단위로 확장.
  - Flyway `V24__business_number_scope.sql`: `slip_number_sequences.slip_type`, `UNIQUE(slip_date, slip_type)`, `ux_slips_slip_type_no_active`.
  - `DispatchTaskService` 배차번호를 `YYYY/MM/DD-{순번}` 으로 변경.
  - Docker/JDK `slip-service` + `arologis-service` 전체 테스트, 모바일 Jest/typecheck, 데스크톱 typecheck, actionlint PASS 후 PR #201 merge.
- D-AX22 구현:
  - slip-service full detail 의 `sourceWarehouseName` UUID 문자열화 fallback 제거.
  - arologis GPS 보고 응답에서 내부 위치 row key 제거.
  - arologis 서명 저장 응답과 sign-and-send-copy 성공 header/body 에서 서명 내부키 제거.
  - sign-and-send-copy 실패 JSON 은 운영 사유 코드만 공개하고 저장 경로/원본 URL/내부키를 숨김.
  - `clients/arologis-mobile` API normalize + Jest/typecheck 로 서버가 내부 필드를 내려도 UI 반환값에서 제거.
  - `clients/desktop` signature 계약 typecheck 추가.
- 문서/QA:
  - `docs/dev-reports/d-ax-22-uuid-free-contract-hardening.md`
  - `docs/qa/d-ax-22-uuid-free-contract-hardening/scenarios.md`
  - `docs/qa/d-ax-22-uuid-free-contract-hardening/domain-integrity-check.md`
  - `docs/team-reviews/d-ax-22/team-1-tm-integration-review.md`
  - QA 캡처 8장 생성 완료: `01-driver-today-target-contract.png` ~ `08-mobile-ui-uuid-free-regression-matrix.png`
- 현재 검증:
  - D-AX22 RED targeted test 실패 확인 후 production patch.
  - targeted backend Gradle PASS.
  - Docker/JDK `:services:slip-service:test :services:arologis-service:test` PASS.
  - XML 집계: `slip-service` 464 tests / failure 0 / error 0 / skipped 0.
  - XML 집계: `arologis-service` 236 tests / failure 0 / error 0 / skipped 0.
  - `clients/arologis-mobile` Jest PASS — 7 suites / 23 tests / skipped 0.
  - `clients/arologis-mobile` typecheck PASS, `npx expo install --check` PASS.
  - `clients/desktop` typecheck/lint/build PASS. lint 는 기존 warning 3건, error 0.
  - `git diff --check` PASS.
  - `actionlint` 는 로컬 PATH 에 없어 실행하지 못함. 이번 PR 은 workflow 파일 변경 없음.
- PR #202 merge 완료, 원격 브랜치 삭제 완료.
- 다음 후보:
  - A: comments/audit/SSE proxy 확장
  - B: 삼한 퍼블릭 거래처 생성/관리 UI gap 점검
  - C: 실제 기기 QA
  - D: Testcontainers no-skip hardening

## 2026-05-16 Codex 최신 핸드오프 — D-AX-20 Admin 사진 감사/재업로드 후보 완료

- branch: `codex/d-ax-20-arologis-admin-photo-audit`
- 직전 완료: D-AX-19 `clients/mobile-staff` 기사 모드 은퇴 PR #199 merge, 원격 브랜치 삭제 완료.
- 사용자 선택/운영 방식:
  - 추천안 1번 — Admin 사진 감사/재업로드 후보 화면.
  - 동시 agent 슬롯 제약상 1개 팀만 운영하고, Codex 가 부모 PM 으로 문서/PR/CI/머지/브랜치 정리까지 통합 관리.
  - 테스트는 skip 하지 않고, 필요한 테스트 환경을 구축해 통과 여부를 확인한다. Docker/Testcontainers 는 가능하면 로컬에서 실행하고, 로컬 접근 불가 시 CI 결과로 재점검한다.
- 새 도메인 정책:
  - UUID 는 내부 PK 이며 Samhan Public / 아로로지스 화면에 표시하지 않는다.
  - 전표/배차 등 사용자 노출 업무번호는 `YYYY/MM/DD-{순번}` 형식을 표준으로 삼는다.
  - 전표번호는 메뉴/업무 속성별로 독립 증가한다. 예: 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 중복 가능하며 UUID PK + 업무 유형으로 구분한다.
  - 날짜가 바뀌면 해당 날짜의 마지막 순번 이후로 증가하고, soft-delete/복구 이력은 UUID PK 와 audit 으로 보존한다.
  - D-AX20 신규 샘플/캡처는 위 형식으로 맞췄고, 기존 `001` padding / `S-2026-*` / `SL-*` 계열은 후속 업무번호 범위형 표준화 PR 후보로 남긴다.
- 구현:
  - BE `GET /slips/admin/photo-audit` 추가. gateway 외부 경로는 `/api/v1/slips/admin/photo-audit`.
  - `type/from/to/slipNo/page/size` 필터, `WAREHOUSE/MANAGER/MASTER` 권한, `uploadedAt desc`, size 최대 100.
  - `slip_attachments` + `slips` read-only JPQL join. 신규 DB/Flyway 없음.
  - 응답은 내부 `attachmentId`, `slipId`, `downloadUrl` 을 포함하지 않는다.
  - desktop `/admin/photo-audit` route + 창고 운영 sidebar `사진 감사` entry 추가.
  - FE 는 raw URL 없는 안전 placeholder 를 표시하고, `uploadedBy` 가 UUID 패턴이면 `업로더 확인 필요`로 치환한다.
  - 현재 페이지 내 `slipNo + attachmentType` 중복을 `재업로드 {count}회` badge 로 표시한다.
- 문서/QA:
  - `docs/dev-reports/d-ax-20-arologis-admin-photo-audit.md`
  - `docs/uiux/d-ax-20-arologis-admin-photo-audit/photo-audit-ux.md`
  - `docs/qa/d-ax-20-arologis-admin-photo-audit/scenarios.md`
  - `docs/qa/d-ax-20-arologis-admin-photo-audit/domain-integrity-check.md`
  - `docs/team-reviews/d-ax-20/team-1-tm-integration-review.md`
  - QA 캡처 7장: `01-scope-contract.png` ~ `07-pr-inline-capture-checklist.png`
- 검증:
  - D-AX20 screenshot generator PASS — PNG 7장 재생성, privacy guard PASS.
  - `clients/desktop` typecheck/lint/build PASS. lint 는 기존 warning 3건, error 0.
  - D-AX20 Playwright contract PASS — 3 tests, skip 없음.
  - Docker Desktop TCP daemon 확인 PASS (`DOCKER_HOST=tcp://localhost:2375`).
  - Docker/JDK Gradle `:services:slip-service:test --tests "*PhotoAudit*"` PASS.
  - Docker/JDK Gradle `:services:slip-service:test` PASS — 461 tests, failure 0, error 0, 기존 Testcontainers IT skip 171.
  - 5-agent 재검토 반영: 내부 audit rule id 캡처 제거, URL성 전표번호 입력 차단, MockMvc security role 테스트, repository JPQL/soft-delete projection 테스트 보강.
  - 기존 IT skip 171건은 D-AX20 신규 skip 이 아니라 Testcontainers provider 가 Docker Desktop TCP remote env 를 valid 로 판정하지 못하는 no-skip hardening 과제.
- 남은 즉시 작업:
  - commit/push/PR 생성.
  - PR 본문 raw screenshot URL 7장 HEAD 200 확인.
  - `gh pr checks --watch` 후 PM 재점검/머지.
- 다음 후보:
  - A: 전표/배차 표시번호 `YYYY/MM/DD-{순번}` 업무번호 범위형 표준화
  - B: 삼한 퍼블릭 거래처 생성/관리 UI gap 점검
  - C: 전표 상세 comments/audit/SSE proxy 확장
  - D: 실제 기기 QA

## 2026-05-16 Codex 최신 핸드오프 — D-AX-19 mobile-staff 기사 모드 은퇴 완료

- branch: `codex/d-ax-19-mobile-staff-driver-retirement`
- 직전 완료: D-AX-18 전표 상세 브리지 PR #198 merge, 원격 브랜치 삭제 완료.
- PR #199 merge 완료, 원격 브랜치 삭제 완료.
- 사용자 선택: 1번 추천안 — `clients/mobile-staff` 기사 모드 제거, 기사 기능은 `clients/arologis-mobile` 전담.
- 구현:
  - `AppRootNavigator` 를 `EstimateWebViewScreen` 단일 렌더로 축소.
  - `clients/mobile-staff/src/screens/driver/**`, `src/api/arologis.ts`, `src/hooks/useGpsPermission.ts`, 기사 전용 Jest 제거.
  - `attachmentApi`, `slipAudit`, `slipComment`, `slipEditRequest`, `SlipRealtimeClient` 는 `salesUtils.API_BASE_URL` 로 이동.
  - `base-64`, `@types/base-64`, `expo-file-system`, `expo-location`, `expo-sharing` 제거.
  - `app.config.js` 에서 위치 권한과 `expo-location` plugin 제거, 정적 `app.json` 삭제.
  - `expo-font` 는 SDK 53 기대 버전으로 정렬.
- 검증:
  - `cd clients/mobile-staff && npm run typecheck` PASS.
  - `cd clients/mobile-staff && npm test -- --runInBand` PASS (1 suite / 1 test).
  - `cd clients/mobile-staff && npx expo install --check` PASS.
  - `cd clients/mobile-staff && npx expo-doctor` PASS (17/17).
  - no driver runtime import guard PASS.
  - `.\scripts\generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1` PASS.
- QA 캡처:
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/01-retirement-decision.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/02-app-root-estimate-only.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/03-no-driver-toggle.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/04-code-boundary-import-guard.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/05-verification-matrix.png`
- 완료 메모:
  - 5-team 최종 리뷰: Designer/FE/BE/QA/DevOps blocker 없음.
  - PR 본문 raw screenshot URL HEAD 200 확인 후 PR #199 merge.
  - `gh pr checks --watch` 완료 후 PM 재점검/머지, 원격 브랜치 삭제 완료.
- 다음 후보:
  - A: Admin 사진 관리/재업로드 감사 화면
  - B: 전표 상세 comments/audit/SSE proxy 확장
  - C: 실제 기기 QA

## 2026-05-16 Codex 최신 핸드오프 — D-AX-18 arologis-mobile 전표 상세 브리지 진행

- 현재 branch: `codex/d-ax-18-arologis-mobile-slip-detail-bridge`
- 직전 완료: D-AX-17 배송사진/검수사진 PR #197 merge, 원격 브랜치 삭제 완료.
- 사용자 선택: 1번 — today 정차 target 기반 읽기 전용 전표 상세 bridge.
- 세부 선택:
  - 추천 1안 채택: `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 서버가 내부 dispatch/stop/slip UUID 를 해석.
  - `mobile-staff` 전표 상세 직접 import/복제는 하지 않음.
  - driver-facing API/UI 에 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 을 노출하지 않음.
  - comments/audit/SSE proxy, 전표 편집 기능은 후속 선택지로 분리.
- 구현:
  - BE `GET /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail` 추가.
  - BE `DriverSlipDetailResponse` 로 전표번호/거래처/주소/창고/품목/합계만 반환.
  - 400 target mismatch, 422 slip mapping 없음, 502 slip-service 상세 실패를 분리.
  - `clients/arologis-mobile` API `fetchStopSlipDetail(...)`, public type guard, dashboard `전표` 버튼, `DriverSlipDetailScreen` 추가.
  - QA 캡처 generator 8장 추가.
- 현재 검증:
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks` PASS.
  - `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` PASS.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand` PASS.
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1` PASS.
- 남은 즉시 작업:
  - PR 본문 raw screenshot URL HEAD 200 확인.
  - `gh pr checks --watch` 후 PM 재점검/머지.
- QA 캡처:
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/01-slip-detail-target-contract.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/02-dashboard-slip-detail-button.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/03-slip-detail-empty-target-guard.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/04-slip-detail-header.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/05-slip-detail-lines-and-total.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/06-slip-detail-mapping-failure-422.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/07-slip-detail-fetch-failure-retry.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/08-verification-matrix.png`
- 다음 후보:
  - A: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - B: Admin 사진 관리/재업로드 감사 화면
  - C: 전표 상세 comments/audit/SSE proxy 확장

## 2026-05-15 Codex 최신 핸드오프 — D-AX-17 arologis-mobile 배송사진/검수사진 진행

- 현재 branch: `codex/d-ax-17-arologis-mobile-photos`
- 사용자 선택: 1번 — 인증된 today stop target 기반 DELIVERY / INSPECTION 사진 이식.
- 세부 선택:
  - 추천 1안 채택: `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 정차를 식별하고 서버 내부에서 slip attachment 로 연결.
  - `mobile-staff` public token/batchToken 흐름은 복제하지 않음.
  - driver-facing API/UI 에 UUID, internal attachment id, presigned/download URL 을 노출하지 않음.
- 구현:
  - BE `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType}` 추가.
  - BE `SlipClient.uploadAttachment(...)` internal multipart bridge 추가.
  - slip-service `/internal/slips/{slipId}/attachments` internal endpoint 추가, DELIVERY / INSPECTION 만 허용.
  - `clients/arologis-mobile` 사진 탭, dashboard `사진` 버튼, empty-target guard, DELIVERY 3장 / INSPECTION 5장 limit, 업로드 진행/성공/실패/재시도 UI 추가.
  - `expo-image-picker`, `expo-image-manipulator` 의존성 추가.
  - typecheck 계약 파일은 `StopPhotoUploadResponse` 에 `attachmentType/fileName/fileSize/contentType/capturedAt/uploadedAt` 만 공개하고 `id/downloadUrl` 은 `@ts-expect-error` 로 차단.
- 검증:
  - `.\gradlew.bat :services:arologis-service:compileJava :services:slip-service:compileJava --no-daemon` PASS.
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --tests com.samhanair.logis.arologis.client.SlipClientTest --no-daemon --rerun-tasks` PASS.
  - `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` PASS.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverPhotoScreen.test.tsx arologisPhotoUpload.test.ts --runInBand` PASS.
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.ps1` PASS.
  - Docker actual run 중 드러난 기존 회귀도 함께 안정화: `KakaoDispatchParserTest` 시간 의존, `DispatchTaskRepositoryIT` seed 충돌, `SlipRealtimeControllerIT` shared realtime payload 계약.
- QA 캡처:
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/01-today-photo-target-contract.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/02-dashboard-photo-and-signature-buttons.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/03-photo-empty-target-guard.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/04-delivery-photo-capture-preview.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/05-inspection-type-switch-max-count.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/06-upload-progress.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/07-upload-success-uuid-free-response.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/08-partial-failure-retry.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/09-slip-mapping-failure-422.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/10-verification-matrix.png`
- 다음 후보:
  - A: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - B: 아로로지스 모바일 상세/전표 bridge 확장
  - C: Admin 사진 관리/재업로드 감사 화면

## 2026-05-15 Codex 최신 핸드오프 — D-AX-16 arologis-mobile signature/sign-and-send-copy 진행

- 현재 branch: `codex/d-ax-16-arologis-mobile-signature-copy`
- 사용자 선택: 1번 — signature / sign-and-send-copy 아로로지스 모바일 이식.
- 세부 선택:
  - 추천 1안 채택: backend `today` 응답을 실제 서명 가능한 정차 target 까지 확장하고, 앱에서 정차 선택 후 `sign-and-send-copy` 호출.
  - `mobile-staff` 의 mock stop/all-zero UUID 방식은 복제하지 않음.
- 구현:
  - BE `GET /driver-app/arologis/dispatches/today` 응답에 `dispatchDate`, `dispatchType`, `label`, `stops[]` 추가. `dispatchId` UUID 는 제외.
  - `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy` 에서 today target 을 서버 내부 UUID 로 해석.
  - `clients/arologis-mobile` API에 `apiFetchRaw`, UUID-free `signAndSendCopy`, image/png → base64 변환 추가.
  - dashboard 카드에 정차 목록 + `서명` 버튼 추가.
  - `DriverSignatureScreen` 신규: 정차 target guard, 실제 signature canvas, 기사 서명 GPS, 인수자 서명, 1-tap 완료 + 사본 발송, duplicate/bridge/fail toast, retry.
  - 하단 tab: `배차` / `GPS` / `서명` + 로그아웃.
- 검증:
  - RED: `ArologisDriverAppControllerTest` 가 `stops` 누락 및 today UUID-free 계약 위반으로 실패 확인.
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest` PASS.
  - `ArologisDriverAppControllerIT.today_with_internal_driver_returns_200` 는 어제/내일 배정 제외 + `dispatchId` 비노출 계약으로 보강.
  - Docker/Testcontainers actual run: `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test --no-daemon --rerun-tasks` PASS (225 tests).
  - Docker actual run에서 드러난 latent failure 수정: auth/driver/refresh seed 충돌, Tx1 rollback 프록시 경계, renderer timeout 재시도 stub, explicit-cleanup IT 트랜잭션 격리.
  - RED: `clients/arologis-mobile/src/__tests__/types/signatureContract.test-d.ts` 추가 후 `signAndSendCopy` / `stops` 타입 누락으로 실패 확인.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverSignatureScreen.test.tsx --runInBand` PASS (6 tests).
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1` PASS.
- QA 캡처:
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/01-today-contract-with-stops.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/02-dashboard-stop-list.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/03-signature-empty-target.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/04-signature-selected-stop.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/05-driver-signature-gps-captured.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/06-recipient-signature-ready.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/07-success-share-sheet.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/08-recipient-phone-missing.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/09-renderer-timeout-retry.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/10-verification-matrix.png`
- 다음 후보:
  - A: 배송사진 / 검수사진 이식
  - B: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - C: signature canvas 실 의존성 도입 여부 결정

## 2026-05-15 Codex 최신 핸드오프 — D-AX-13 auth contract 정합 진행

- 현재 branch: `codex/d-ax-13-auth-contract`
- 선택된 방향: 사용자 승인 1번 — `/auth/me`와 login/refresh 응답의 공개 식별자 계약을 BE/FE에서 한 번에 정합.
- 구현:
  - BE `AuthTokenResponse`에 role별 공개 식별자(`loginId/fullName`, `driverCode/phoneNumber`) 추가.
  - BE `MeResponse`도 같은 공개 식별자 schema 로 확장.
  - `AuthIdentityService` 추가: JWT `X-User-Id`/`X-User-Role` 기준으로 DB row 재조회, role mismatch/user gone 은 401.
  - desktop `LoginPage`와 refresh interceptor 에서 `loginId/fullName` undefined 저장 방지.
  - mobile auth API와 refresh helper 에서 `driverCode/phoneNumber` 보존.
- 검증:
  - RED: 새 필드 테스트 추가 후 `compileTestJava`가 `loginId/fullName/driverCode/phoneNumber` method 없음으로 실패 확인.
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.service.auth.AdminLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.DriverLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.RefreshTokenServiceTest"` PASS
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.it.ArologisAdminAuthIT" --tests "com.samhanair.logis.arologis.it.ArologisDriverAuthIT"` PASS
  - `cd clients/arologis-desktop && npm run typecheck` PASS
  - `cd clients/arologis-mobile && npm run typecheck` PASS
- QA 캡처:
  - `docs/qa/d-ax-13-auth-contract/screenshots/01-contract-overview.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/02-admin-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/03-auth-me-admin.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/04-driver-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/05-auth-me-driver.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/06-refresh-rotation-identity.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/07-frontend-store-flow.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/08-verification-matrix.png`
- 다음 후보:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: 실제 기기 QA 및 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-15 arologis-mobile dashboard/GPS 진행

- 현재 branch: `codex/d-ax-15-arologis-mobile-driver-runtime`
- 사용자 피드백: Claude처럼 진행 방향은 다자선택으로 제시하고, Codex가 멋대로 결정하지 않는다.
- 채택 방향: 추천안 B — `clients/arologis-mobile` 에 dashboard + GPS 두 탭만 먼저 이식.
- 구현:
  - 로그인 성공 후 `RootNavigator` 가 `DriverTabNavigator` 로 진입.
  - `DriverDashboardScreen` / `DriverLocationTrackingScreen` 을 독립 앱 내부로 이식.
  - `api/arologis.ts` 는 `GET /driver-app/arologis/dispatches/today`, `POST /driver-app/arologis/locations` 만 담당.
  - 서명 / 배송사진 / 검수사진 / mobile-staff driver 제거는 후속 PR 선택지로 남김.
- 검증:
  - `cd clients/arologis-mobile && npm install`
  - `cd clients/arologis-mobile && npm run typecheck`
  - `rg -n 'clients/mobile-staff|mobile-staff|../../../mobile-staff' clients/arologis-mobile/src` 결과 없음
  - `.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`
- QA 캡처:
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/01-authenticated-driver-tabs.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/02-driver-dashboard.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/03-gps-tracking.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/04-dashboard-empty.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/05-dashboard-error.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/06-gps-permission-block.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/07-typecheck-pass.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/08-import-boundary-pass.png`
- 다음 선택지:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: `/auth/me` schema 정합 검증
  - D: 실기기 QA 후 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-12 mobile cross-import 분리 진행

- 현재 branch: `codex/d-ax-12-mobile-cross-import`
- 방향: D-AX-11 완료 후 같은 아로로지스 추출 흐름으로 `clients/mobile-staff` driver tab 의 Samhan Public slip 직접 import 를 먼저 제거.
- 구현:
  - `DriverTabNavigator` 의 `../SlipDetailScreen` import 제거.
  - `DriverSlipDetailEntry` 신규 경계 화면 추가.
  - dashboard → entry → back Jest 추가.
  - 기존 `SignaturePhotoScreenChain` mock 을 driver entry 로 교체.
- 검증:
  - `cd clients/mobile-staff && npm test -- DriverSlipDetailRoute.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm test -- SignaturePhotoScreenChain.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm run typecheck` PASS
  - `rg -n "from '../SlipDetailScreen'|SlipDetailScreen from|\\.\\./SlipDetailScreen" clients/mobile-staff/src/screens/driver` 결과 없음
  - `.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1` PASS
- QA 캡처:
  - PR 본문에 아래 8장을 모두 인라인 첨부한다. 캡처는 여러 테스트를 진행한 뒤 생성한 1000px 폭 PNG mock render 라서 GitHub 에서 문구와 버튼이 잘 보인다.
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/01-driver-slip-guard.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/02-signature-chain-regression.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/03-driver-route-test-flow.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/04-driver-back-navigation.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/05-typecheck-contract.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/06-jest-driver-route-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/07-jest-signature-chain-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/08-direct-import-search-guard.png`
- 문서:
  - spec: `docs/superpowers/specs/2026-05-15-d-ax-12-mobile-cross-import-design.md`
  - dev report: `docs/dev-reports/d-ax-12-mobile-cross-import.md`
  - QA: `docs/qa/d-ax-12-mobile-cross-import/scenarios.md`
- 다음 후보:
  - `clients/arologis-mobile` 로 driver dashboard / GPS / signature / photo 화면 이식.
  - 실제 slip 연결값이 배차 응답에 포함되면 `DriverSlipDetailEntry` 를 아로로지스 전용 상세 bridge 로 확장.

## 2026-05-15 Codex 최신 핸드오프 — D-AX-11 PR #192 머지 완료

이 섹션이 아래의 과거 `D-AX-11 in progress` 기록보다 우선한다.

- 현재 브랜치: `main`
- 최신 main commit: `5599580 feat(arologis): D-AX-11 배차 페이지 데스크톱 이전`
- PR: https://github.com/ewoo14/SamhanLogis/pull/192
- 머지 커밋: `55995805d2922084c516f942d02f3cf1382a6407`
- 상태: D-AX-11 완료, PR #192 squash merge 완료, remote main 최신.
- 최종 CI: PR head `bfc5f7d` 기준 GitHub checks 전체 통과.
- QA: `qa/playwright`의 Chromium mock render로 한국어 화면 4장 캡처 완료.
- QA 산출물:
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/01-manual-dispatch.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/02-pre-classify.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/03-unassigned.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/04-reconcile.png`
- PR 포함 항목: 5-team review 표, TM 통합, PM/CI 승인, QA 스크린샷, 리뷰 반영 내역.
- 별도 세션 기록: `docs/handoff/2026-05-15-codex-d-ax-11-session.md`
- dev report: `docs/dev-reports/arologis-dispatch-pages-extract.md`

다음 세션 첫 명령:

```powershell
git checkout main
git pull
git log --oneline -5
Get-Content AGENTS.md, docs/handoff/CURRENT-WORK.md, .codex/AGENTS.md -Encoding UTF8
```

다음 후보 작업은 새 결정을 만들기 전에 `migration/decisions/DECISIONS.md`와 해당 slice spec/plan을 먼저 확인한다. 사용자가 “그대로 진행”을 요청하면 Claude handoff 패턴대로 5-team review, PR 본문 QA 스크린샷, PM/CI 승인 코멘트를 포함한다.

## 2026-05-15 Codex Update — D-AX-11 in progress

- Current branch: `feat/arologis-dispatch-pages-extract`
- Current scope: Arologis desktop dispatch pages under `clients/arologis-desktop/src/renderer/routes/dispatches`
- Handoff pattern: 5-team review dispatched and received (BE / FE / Designer / QA / DevOps). Review fixes are being applied in this same branch.
- Implemented routes: `/dispatches/manual`, `/dispatches/pre-classify`, `/dispatches/unassigned`, `/dispatches/reconcile`
- Key fixes from review: `kakaoSeq` DTO alignment, Arologis role constants, design-system CSS import, raw hex cleanup, desktop CI typecheck hard-fail, D-AX-11 route IA note.
- Phone check: remote/PR viewing requires push/PR network access. Per owner instruction, no approval prompt will be requested for non-merge work; keep local handoff current until a permitted push path is available.

---

## 0. 즉시 시작 — 코덱스에서 첫 명령

```powershell
git checkout main
git pull
git log --oneline -5
# → 1ad4296 feat(samhan-signature-copy): Phase F (#191) 가 가장 최근 머지
```

**코덱스가 모르는 본 repo 의 핵심 컨벤션** (Claude Code `.claude/memory/` 가 있지만 코덱스는 못 읽음 — 아래만 알면 충분):

| 규칙 | 요점 |
|---|---|
| 한국어 commit/PR/Issue | prefix (`feat:`/`fix:`/...) + trailer 만 영어, 본문은 한국어 |
| 5-team 패턴 | BE/FE/Designer/DevOps **4 parallel** + QA **sequential** (실 산출 검증 + 실 캡처) |
| 통합 PR | 단편 PR 금지. 디자인/UI 차이까지 묶어 통합 PR + QA + TM 승인 |
| QA 스크린샷 | 모든 PR 본문에 QA 결과 스크린샷 1장 이상 인라인 (`docs/qa/<slug>/screenshots/*.png`) |
| QA mock fallback | 실 emulator 어려운 경우 PowerShell System.Drawing mock PNG OK (`scripts/generate-*-screenshots.ps1` 패턴) |
| UUID 비공개 | 모든 클라이언트 화면 UUID 노출 금지. 비즈니스 식별자 (슬립번호/창고 코드/거래처명) 만 |
| BaseEntity 7 audit | 모든 entity 가 `BaseEntity` 상속 + Soft Delete 만 |
| Korean Path JDK 트랩 | 한글 path 에서 `gradle test` fail. `assemble` 사용 또는 영문 path |
| gradlew chmod | Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수 (Linux CI Permission denied 방지) |
| PowerShell UTF-8 | `Set-Content` 기본 UTF-16 LE BOM 트랩. Write/Edit/heredoc 사용 |
| 머지 권한 | 사용자 (개발책임자) 결정. 5-team 0 결함 + CI green 시도 사용자 trigger 만 머지 |

---

## 1. 방금 끝난 일 — Phase F (PR #191) 머지 완료 (2026-05-15)

**PR**: https://github.com/ewoo14/SamhanLogis/pull/191 — **MERGED** (squash commit `1ad4296`)
**제목**: `feat(samhan-signature-copy): Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (D-DF-01~13)`

### 핵심 산출 (한 줄 요약)

기사 어플 정차 도착 → DELIVERY 사진 첨부 (기존 SignaturePhotoScreen) → DriverSignatureScreen 자체+인수자 서명 → arologis 가 양쪽 저장 (자체 signatures + slip-service signature_source=APP) + 서버 Playwright Chromium 으로 OutboundView 양식 사본 PNG 합성 + mobile expo-sharing Share Sheet 으로 인수자에게 발송 (**기사 본인 카톡, Aligo 0**).

### 13 결정 (D-DF-01~13)

`migration/decisions/DECISIONS.md` 의 D-DF-00 entry 참조. 핵심:
- **Aligo 폐기** → mobile RN expo-sharing Share Sheet (기사 본인 발신)
- **PNG 합성 방식** = 서버 측 Playwright Java SDK 1.47 + Chromium headless → `OutboundView.tsx` URL (file://) 렌더링 → fullPage screenshot
- **양쪽 저장** = arologis 자체 `signatures` + slip-service `signature_source=APP` + `slip_signature_audit`. 출고전표 본체 (Slip) 는 slip-service 단일 SOT
- **사진 첨부 통합 (D-DF-13)** = 기존 SignaturePhotoScreen (P1-8 Stage 4) W10-4 deep link 활성. 사진은 slip-service attachment 별도, 사본 PNG 와 분리

### 4 신규 컬럼 (Flyway V11) — `arologis.signatures`

| 컬럼 | 의미 |
|---|---|
| `copy_sent_at` | PNG download 시각 (성공 1회 가드, NULL → OK, NOT NULL → 409) |
| `copy_send_failure_count` | Tx2 c/d fail 카운트 (모니터링 alert 임계치) |
| `copy_image_path` | disk path (`/var/lib/arologis/signature-copies/{signatureId}.png`) — Phase 11 cutover 시 S3 키로 갈아탐 |
| `copy_recipient_phone` | 발송 시점 slip recipientPhone 스냅샷 (풀 번호) |

### 핵심 파일 (Phase F 신규/수정)

```
services/arologis-service/
├── src/main/java/com/samhanair/logis/arologis/
│   ├── domain/Signature.java                                    (4 column + markCopySent + markCopyFailure)
│   ├── service/copy/
│   │   ├── SignAndSendCopyService.java                          (Tx1 atomic + Tx2 best effort orchestration)
│   │   ├── PlaywrightCopyRenderer.java                          (Playwright wrapper, RendererTimeoutException/RendererErrorException)
│   │   ├── CopyImageDiskStorage.java                            (disk save)
│   │   └── CopyFailureReason.java                               (enum)
│   ├── controller/ArologisDriverAppController.java              (POST /sign-and-send-copy 추가, /sign @Deprecated)
│   ├── client/SlipClient.java                                   (findRecipientPhone + findFullDetail 추가)
│   ├── service/SlipResolver.java                                (findRecipientPhone + buildSlipDataMap)
│   ├── config/PlaywrightConfig.java                             (Browser bean, @ConditionalOnProperty)
│   └── web/dto/copy/SignAndSendCopy{Request,Response}.java
├── src/main/resources/db/migration/V11__add_signature_copy_columns.sql
└── Dockerfile                                                    (Playwright + Chromium + fonts-noto-cjk)

clients/desktop/
├── print-renderer/                                               (NEW — multi-entry)
│   ├── index.html / main.tsx / PrintRendererApp.tsx
└── vite.print-renderer.config.ts

clients/mobile-staff/
├── src/api/arologis.ts                                           (signAndSendCopy + 응답 분기 타입)
├── src/screens/driver/
│   ├── DriverSignatureScreen.tsx                                 (1-tap 완료+발송 + Share Sheet + 5 토스트)
│   ├── SignaturePhotoScreen.tsx                                  (onUploaded → DriverSignature chain)
│   └── DriverTabNavigator.tsx                                    (signature-photo 탭 추가)
└── package.json                                                  (expo-sharing + expo-file-system + base-64 추가)

services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java   (/recipient-phone + /full 추가)

docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md   (v3.1, 13 결정)
docs/superpowers/plans/2026-05-15-samhan-signature-copy.md          (5-team plan)
docs/dev-reports/samhan-signature-copy.md                            (3-layer 누적)
docs/qa/samhan-signature-copy/scenarios.md                            (7 시나리오 + 회귀 + 4단계 롤백)
docs/qa/samhan-signature-copy/screenshots/01~07.png                  (PowerShell mock fallback)
scripts/generate-samhan-signature-copy-screenshots.ps1                (재실행 스크립트)
docs/uiux/samhan-signature-copy/01~03.md                              (Designer mock 3장)
docs/migration/phase11/M-PHASE-11-signature-copy-memory.md           (Chromium 메모리 검증)
infrastructure/env-templates/arologis-service.env                     (4 env 추가)
```

### spec/plan vs 실 코드 정정 9건 (BE worker 자체 정정 — plan 문서와 실 코드 차이)

1. `VehicleStop` 직접 dispatchId 미보유 → 권한 = `vehicle.assignedDriverId == driverId`
2. Slip 의 `sourceWarehouseName` 미존재 → `sourceWarehouseId.toString()` placeholder
3. Slip 의 `recipientAddress` X → `deliveryAddress` 사용
4. Slip 의 `recipientPhoneNumber` X → `recipientPhone` (V20 column)
5. Slip 의 `totalSupply`/`vat`/`total` getter 미존재 → lines 합산 계산
6. `VehicleStop.recipientName` 미존재 → "어플인수자" placeholder
7. `DriverPrincipal` 미도입 → `X-User-Id` → `DriverRepository.findByAppUserId` 패턴
8. `PlaywrightConfig` — `@ConditionalOnProperty(arologis.playwright.enabled=true)` 추가
9. `SignatureRepository.findFirstByStopIdAndSourceOrderByCreatedAtDesc` 미존재 → `findAllByStopIdOrderByCapturedAtDesc` stream filter

### 통계

- BE 8 commit + FE 5 + Designer 1 + DevOps 3 + QA 2 + TM 통합/PR/QA fix 다수 = 23 commit
- arologis-service: **221 tests / 0 fail / 75 skipped (Docker npipe — IT 5건 코드만, CI Linux 실행)**
- slip-service: **454 tests / 0 fail / 171 skipped** (PR #99 SignatureIntegrationIT 보존)
- mobile-staff: **TS 0 errors + Jest 7 PASS** (DriverSignatureScreen 6 + SignaturePhotoScreenChain 1)
- desktop print-renderer build: **SUCCESS (148.67 kB)**
- CI 21 check all PASS + GitGuardian PASS
- 회귀 0 결함

---

## 2. PR #191 후속 — 즉시 진행 가능한 fix (선택)

| # | 후속 작업 | 우선순위 | 추정 |
|---|---|---|---|
| F1 | QA 캡처 텍스트 잘림 fix (01/05/07 우측/좌측 1~2 글자) | LOW | 30분 (PowerShell width margin 또는 텍스트 단축) |
| F2 | `.claude/memory/project_samhan_signature_copy.md` 신규 메모리 작성 | LOW | 10분 (TM agent 권한 차단으로 미작성, 결정은 DECISIONS + dev-report 보존) |
| F3 | Admin 재발송 endpoint PR (`/admin/.../signatures/{id}/resend-copy`) | MEDIUM | 1~2일 spec + plan + 5-team |
| F4 | KakaoLink SDK deep link PR (인수자 번호 prefill) | MEDIUM (사용자 피드백 후) | 2~3일 |
| F5 | `/sign` endpoint 완전 제거 PR (1~2 분기 후) | LOW | 30분 |
| F6 | OutboundView refactor (옵션 a — useQuery 분리, drift 0 우선시) | LOW | 1일 |
| F7 | Phase 11 disk → S3 cutover PR | Phase 11 시점 | 별도 |
| F8 | `copy_send_failure_count` Slack alert (>5 / 10분) | LOW | 반나절 |

---

## 3. 다음 trigger 후보 (개발책임자 결정)

### 즉시 가능 (인성 자료 무관)

- **Phase E** — 인수자 카톡/문자 발송 (배차 기사 정보) — notification-service Aligo 활용. spec 신규 필요 (브레인스토밍 권장).
- **D-AX-11** — FE 산재 페이지 이전 (`ArologisManualDispatchPage` 등 4 page + Api 3 + RealtimeClient) — HIGH 우선순위. spec 신규.
- **D-AX-12** — mobile cross-import 분리 (`DriverTabNavigator` → `SlipDetailScreen`) — Phase F 머지 후 환경 안정화 후 진행 권장. spec 신규.
- **D-AX-13** — BE/FE auth schema 정합 검증 (`/auth/me` 응답) — 작은 PR.
- **ACM SAN 갱신** — Terraform `*.arologis.samhan-air.com` 추가 (Phase 11 cutover 전).
- **EC2 Health Lambda** — CloudWatch alarm + SNS 별도 PR.
- **Phase F 후속 fix** — F1~F8 위 표 (단순 fix 부터 큰 PR 까지).

### 인성데이타 API 링크 도착 대기 (사용자 요청 "추후")

- **Phase B** — arologis `InsungQuickDriverMatcher` 실 활성 (W10-2 trigger).
- **Phase D** — GPS 실시간 공유 (SSE) — 인성 LBS callback endpoint.

---

## 4. 본 conversation 누적 머지 (8 PR, PR #184~#191)

| PR | merge commit | 내용 |
|---|---|---|
| #184 | `f3cb306` | 아로로지스 독립 분리 (D-AX-01~10) — monorepo 유지 + 자체 auth + 휴대번호 passwordless |
| #185 | `26f2bc3` | post-merge follow-up — mock PNG 6장 + handoff + autopilot 메모리 v2 |
| #186 | `2bd653f` | D-AX-14 자동 폰번호 인식 + 1-tap 로그인 (PR #184 보완) |
| #187 | `cc106d1` | D-AX-14 mock 스크린샷 3장 follow-up |
| #188 | `01d41f6` | **Phase A — 배차 메뉴 + 아로로지스 발송** (D-DB-01~09) |
| #189 | `9bebe12` | **Phase C — 배차 수정/취소 요청 흐름** (D-DC-01~09) + 5-team 패턴 정정 메모리 |
| #190 | `3b3d04d` | handoff 갱신 — PR #184~#189 머지 + Phase F spec 리뷰 대기 + 후속 Phase 안내 |
| #191 | `1ad4296` | **Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송** (D-DF-01~13). 새 5-team (QA sequential) 첫 적용 + Aligo 폐기 + Playwright Chromium 도입 |

---

## 5. 코덱스 진입 시 권장 흐름

1. **`git pull`** + `git log --oneline -5` 로 main 의 최신 (`1ad4296`) 확인.
2. **본 파일 (`docs/handoff/CURRENT-WORK.md`) 다시 read** — 진행 상태 즉시 파악.
3. **사용자 (개발책임자) 의 다음 trigger 메시지 대기** — §3 의 후보 중 하나, 또는 새 작업.
4. 작업 시작 시 **§0 의 컨벤션 표** 준수 (한국어 commit + 통합 PR + QA 캡처 + UUID 비공개 등).
5. 큰 작업 (신규 Phase, 새 endpoint 다수) = brainstorm → spec → plan → 5-team 디스패치 → TM 통합 → PR 발행 → 사용자 머지 패턴 따름.
6. 작은 작업 (단순 fix, env 변경, 문서) = 즉시 commit + PR (단 통합 PR 패턴 유의).

### 5-team 디스패치 시 (Claude Code 환경에서 검증된 패턴, 코덱스 환경에서는 적응 필요)

본 repo 의 `.claude/worktrees/` 가 Claude Code 의 git worktree isolation 디렉토리. 코덱스도 git worktree 사용 가능 (`git worktree add ...`). 4 team 동시 worktree 분리 → 머지 패턴.

또는 코덱스 환경에서 단순화: TM 한 사람이 모든 team scope 를 순차 진행 (slow 하지만 단순).

### 메모리 시스템 (Claude Code 전용 — 코덱스 무관)

`.claude/memory/MEMORY.md` 는 Claude Code 의 자동 로드 메모리. 코덱스는 이 시스템 모름. 그러나 git tracked 라 코덱스도 read 가능. 본 파일 (CURRENT-WORK.md) + `migration/decisions/DECISIONS.md` + `docs/superpowers/specs/` + `docs/superpowers/plans/` + `docs/dev-reports/` 만 알면 충분.

**Claude Code 로 다시 돌아올 때**: `.\scripts\sync-claude-memory.ps1` 실행 (repo .claude/memory → 사용자 홈 ~/.claude/projects/c--dev-SamhanLogis/memory/ 단방향 복사).

---

## 6. 통계 (본 conversation, 2026-05-14 ~ 05-15)

- 누적 PR 머지: **8** (#184~#191)
- 누적 commit: ~170+ (5-team x 7 cycle + TM + PM + fix)
- 누적 메모리 (Claude Code): 8 신규 (Phase F 의 `project_samhan_signature_copy` 만 미작성, DECISIONS + dev-report 보존)
- 누적 DECISIONS entry: D-AX-01~14 + D-DB-01~09 + D-DC-01~09 + D-DF-01~13 (50+ entry)
- 회귀 가드: 모든 PR 0 결함 (slip-service 단위 ~98 + IT 50+ 보존)
- AWS 비용 변경: ₩0 (Phase 11 계획 ₩405K/월 유지, Chromium ~500MB pool 은 m5.xlarge 16GB 여유 안 — `docs/migration/phase11/M-PHASE-11-signature-copy-memory.md`)

---

## 7. 양 PC 작업 인계 절차 (Claude Code)

### 떠나는 PC (현재 PC)

```powershell
# CURRENT-WORK.md 갱신은 본 commit 으로 진행
git checkout main
git pull
```

### 도착하는 PC (회사/집)

```powershell
git pull
.\scripts\sync-claude-memory.ps1   # 8 신규 메모리 동기화 (Claude Code 사용 시)
# Claude Code 새 세션 → CLAUDE.md 자동 로드 + 본 파일 read 으로 컨텍스트 회복
# 코덱스 사용 시 → 본 파일 read + git pull 만으로 충분
# trigger: §3 의 후보 중 하나, 또는 새 작업
```
