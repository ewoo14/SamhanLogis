# TM 통합 검증 보고서 — PR #142 (P0-9 입고 검수 UI)

- 검증자: TM (Tech Manager)
- 검증일: 2026-05-11
- 대상 PR: https://github.com/ewoo14/SamhanLogis/pull/142
- 대상 브랜치: `feature/p0-9-warehouse-inspection-ui`
- 베이스: `main`

---

## 1. 검증 요약

| Check | 결과 | 비고 |
| --- | --- | --- |
| UUID 정합성 (slipId / lineId / slipLineId / productId / warehouseId) | PASS | seed UUID `b0b0b0b0-...`, `f0f0f0f0-...`, `a0a0a0a0-...`, `11111111-...` 일관 |
| API contract (BE/FE 정합) | FIXED | InspectionStatus enum drift / `productId` → `slipLineId` / `slipDate` undefined 모두 자가 fix |
| 디자인 일관성 (design-system Badge / token / Modal) | FIXED | Modal `xl` 사이즈 추가 + Dialog `size="xl"` 적용 (Designer 가이드 정합) |
| 도메인 정합성 (Layer 4 메서드) | PASS | `create / addLine / recordInspectorId / recordResult / complete / markStockApplied / cancel` chain 정확 + defectQty>0 → defectReason 필수 가드 |
| Flyway migration 의존성 (V5 → V6) | FIXED | V6 헤더 코멘트 오타(`V5` → `V6`) 자가 fix. V6 자체는 baseline 시드, 의존성 없음 |
| 메모리 가드 (PR #134~#141 회고) | PASS | UUID 비공개 / 한국어 / Layer 4 / @MockBean lenient / extends AbstractPostgresIT / Role 풀네임 / Korean accounting / commit 한국어 |
| 풀빌드 (assemble) | PASS | `gradlew :services:inventory-service:assemble` BUILD SUCCESSFUL |
| FE typecheck | PASS | `desktop` + `design-system` 모두 exit 0 |
| BE 단위 테스트 | PASS | `InboundInspectionServiceTest` 12 PASS |
| Testcontainers IT | DEFERRED | Windows + Docker Desktop npipe 한계 (`feedback_testcontainers_windows_docker.md`). PM 풀빌드 단계 또는 CI 에서 검증 |

---

## 2. 발견 이슈 + 자가 fix 내역

### Blocker B1 — `SlipClient` URI prefix 오류 (런타임 100% 404)

- **원인**: `SlipClient.getSlip()` 가 `/api/v1/slips/{slipId}` 호출하는데, slip-service 의 `SlipController` 는 `@RequestMapping("/slips")` 로 등록되어 있다. `SlipClient` 는 `lb://slip-service` 직접 호출이므로 api-gateway 의 `StripPrefix=2` 효과가 적용되지 않는다.
- **결과**: 실 운영에서 검수 GET/inspect/complete 호출 시 100% `404 → BusinessException(NOT_FOUND)`. P09ValidationIT / InboundInspectionControllerIT 는 SlipClient 를 `@MockBean` 으로 격리하므로 IT 만으로는 발견되지 않음.
- **fix**: `SlipClient` URI 를 `/slips/{slipId}` 로 정정 + Javadoc 에 gateway prefix 비적용 사유 명시.
- **회귀 위험**: 없음 (기존 inventory-service `SlipServiceClient` / partner-order `SlipServiceClient` 도 동일 `/slips/...` 패턴 사용 중).

### Blocker B2 — InspectionStatus enum BE/FE drift

- **원인**: BE `InspectionStatus` = `PENDING / COMPLETED / CANCELED`. FE `inboundInspectionApi.ts` = `PENDING / DRAFT / COMPLETED`.
  - `DRAFT` 는 BE 에 없는 가상 상태 → 필터 dropdown 선택 시 BE 가 400 (`올바르지 않은 status 값`).
  - `CANCELED` 는 BE 가 발행하지만 FE 의 `STATUS_VARIANT` Record 에 키 없음 → Badge 렌더 시 TypeScript Record 미스매치 + 런타임 undefined.
- **fix**:
  - `inboundInspectionApi.ts` 의 `InboundInspectionStatus` 를 BE 1:1 정합으로 정정 (`PENDING / COMPLETED / CANCELED`).
  - `INSPECTION_STATUS_LABEL` `검수대기 / 검수완료 / 검수취소` (BE `displayName` 일치).
  - `InboundInspectionListPage.STATUS_VARIANT` + 필터 dropdown 갱신 (`PENDING=warning`, `COMPLETED=success`, `CANCELED=danger`).
  - `InboundInspectionDialog.STATUS_VARIANT` 동일 갱신.
  - `mock.ts` 의 시연 데이터 `DRAFT` → `PENDING` 변경 (BE 정의 enum 정합).

### Blocker B3 — FE `productId` 필드가 BE 에 없음

- **원인**: FE `InboundInspectionLine.productId: string` 는 BE `InboundInspectionLineResponse` 에 없는 필드 (BE 는 `slipLineId` 반환). 런타임에 `undefined` 가 되어 strict TS guard 통과 못 함.
- **fix**:
  - FE 의 `InboundInspectionLine.productId` → `slipLineId?: string | null` (BE 와 1:1).
  - `InboundInspectionDialog.LineState.productId` → `slipLineId: string | null`.
  - `mock.ts` 의 라인 mock `productId` → `slipLineId`.

### Warning W1 — V6 SQL 헤더 코멘트 오타

- **원인**: `V6__seed_p09_inbound_inspection.sql` 1행 코멘트가 `-- V5__seed_p09_inbound_inspection.sql` 로 잘못 적힘.
- **fix**: 코멘트만 정정. Flyway 동작에는 영향 없음 (실제 파일명만 사용).

### Warning W2 — `slipDate` undefined 렌더링

- **원인**: BE 가 `slipDate` 를 매번 slip-service 에서 가져오나, FE 가 `null` 처리 없이 그대로 렌더하면 빈값 노출.
- **fix**: FE 의 두 위치 (`InboundInspectionListPage` 컬럼 render, `InboundInspectionDialog` 헤더) 에서 `?? '—'` 안전 fallback 추가.

### Warning W3 — Modal `xl` 사이즈 부재

- **원인**: Designer 가이드 (`INBOUND-INSPECTION-DESIGN.md`) 는 검수 dialog 를 `Modal xl` 로 명세하나, design-system `ModalSize` enum 은 `'sm' | 'md' | 'lg'` 만 지원.
- **fix** (parallel agent):
  - design-system `Modal.tsx` `ModalSize` 에 `'xl'` 추가, `Modal.module.css` `.size-xl { max-width: 1080px; min-width: 980px; }` 추가.
  - `InboundInspectionDialog` `size="lg"` → `size="xl"` (Designer 가이드 정합).

### Nit N1 — defectQty > 0 인데 defectReason 누락 시 BE 도메인 가드 + FE UX 가드

- **fix** (parallel agent BE + 본 TM commit FE):
  - BE: `InboundInspectionLine.recordResult()` 에 `defectQty > 0 && (defectReason == null || isBlank())` → `BusinessException(INVALID_INPUT)` 가드 추가.
  - FE: `InboundInspectionDialog.validationError()` 헬퍼로 라인별 사용자 친화 메시지 (예: `AJ040RXH4BC1: 불량 수량이 1 이상이면 불량 사유를 입력해야 합니다.`).

---

## 3. 권장 — Phase 12+ 후속 작업 (블로커 아님)

PM 회수 + 후속 슬라이스로 이관 권장:

| 항목 | 이유 |
| --- | --- |
| **검수자 이름 (`inspectorName`) snapshot** | 본 슬라이스에서 BE 는 항상 `inspectorName: null` 반환 (user-service 조회 미구현). P1 유저 슬라이스에서 user-service 호출 또는 검수 완료 시 user 이름 snapshot 저장 |
| **검수 취소 (CANCELED) UI** | BE `cancel()` 메서드 존재하지만 FE 호출 버튼 없음. P1 슬라이스에서 추가 |
| **`InboundInspectionLineRepository` 미사용 점검** | service 가 cascade 로 처리 — 실제 사용처 없음 (불필요 시 제거 가능) |
| **`InspectableStatuses` 와 매뉴얼 정합** | service 코드는 `SAVED/CONFIRMED/COMPLETED/PROCESSING/INSPECTING` 5개 허용, 매뉴얼/Javadoc 은 `SAVED/CONFIRMED` 표기 — 동기화 필요 |
| **slip-service `/slips` API 의 internal-token 인증 경계 표준화** | InternalTokenFilter + JWT filter chain 우선순위 문서화 (PR #99 W10-4 후속) |

---

## 4. 메모리 가드 점검표 (PR #134~#141 회고)

- `feedback_uuid_no_user_visibility` — slipId path param 만 사용, 화면 표시 식별자는 slipNo / modelCode (PASS)
- `feedback_korean_commits` — 본 PR 5 commit 모두 한국어 (PASS)
- `feedback_role_naming_full` — `WAREHOUSE / MANAGER / MASTER` 풀네임 (PASS)
- `feedback_no_dev_director_mention` — 본 PR 본문 / 코드 / 문서 미사용 (PASS)
- `feedback_it_mockbean_external_clients` — P09ValidationIT 가 `SlipClient/ProductClient/AccountingClient` 3종 `@MockBean` + `Mockito.lenient()` 사용 (PASS)
- `feedback_korean_path_jdk` — local 검증은 `assemble` + `:service:test` 단위 테스트만 (Korean path JDK 트랩 회피)
- `feedback_pr_qa_screenshots` — TM 검증 시점 미확인. PM 풀빌드 + 스크린샷 추가 의무
- `feedback_continuous_docs_sync` — `docs/dev-reports/p0-9-warehouse-inspection-ui.md` + `docs/manual/02-창고/01-입고-처리.md` 동시 갱신 (PASS)
- `project_korean_accounting` — 본 슬라이스는 회계 분개 미발행 (검수 → 재고 movement 만). 분개는 P0-1 회계 슬라이스 책임이므로 본 PR 범위 외 (PASS)

---

## 5. PM 위임 사항

1. 풀빌드 + 14 service 컴파일 검증
2. CI watch (`gh pr checks 142 --watch`) — 모든 GitHub Actions green 확인
3. PR 본문에 QA 스크린샷 1장 인라인 첨부 (`docs/qa/p0-9/*.png`)
4. PM 최종 승인 댓글 → 개발책임자 머지 요청

---

## 6. TM 검수 결과

**조건부 통과** — Blocker 3건, Warning 3건, Nit 1건 자가 fix 후 통합. 후속 권장 5건 P1 이관.

PM 풀빌드 + CI green 확인 후 머지 가능.
