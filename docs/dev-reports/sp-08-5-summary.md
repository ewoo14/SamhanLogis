# SP-08-5 매입 CRUD parity 시리즈 종료 보고

> SP-08-5 series — 매입 전표 R1/R2/U1/D1/C1/P1 6 슬라이스 5 PR 누적 머지 완료. 본 통합 보고서는 시리즈 전체를 종합한다.

## 1. 시리즈 개요

| 슬라이스 | PR | mergeCommit | 머지일 | 사이클 |
|---|---|---|---|---|
| **SP-08-5-1** R1/R2 매입 목록·상세 endpoint 잠금 | #220 | `0d621b36` | 2026-05-17 | N=2 |
| **SP-08-5-2** U1 매입 수정 direct PUT + optimistic lock | #221 | `61925942` | 2026-05-17 | N=2 |
| **SP-08-5-3** D1 매입 soft delete + InboundInspection 정책 | #222 | `211711a1` | 2026-05-18 | N=2 |
| **SP-08-5-4** C1 검수 CTA 회귀 + InboundInspection 흐름 검증 | #223 | `1486e610` | 2026-05-18 | N=1 |
| **SP-08-5-5** P1 매입 전표 인쇄 양식 + A4 portrait | #224 | `dafee351` | 2026-05-18 | N=1 |
| **SP-08-5-6** 통합 검증 (본 보고서) | TBD | TBD | 2026-05-18 | — |

**누적 통계** (5 PR):
- 사이클 평균: N=1.6 (5회차 워크플로우 효율 우수, N=3 제약 안)
- CI 누적: 100+ check SUCCESS (24+24+24+20+20 = 112)
- TM PR comment 누적: Claude/Codex 양쪽 각 사이클 통합 = 약 16건
- 신규 코드: 약 +4,000 줄 (BE/FE/Design docs/QA spec/PNG)
- 신규 IT: 30+ case 누적 (SlipUpdateIT 9 / SlipDeleteIT 10 / SlipInspectionCtaRegressionIT 6 + 회귀)
- 신규 Playwright: 25 case (5 × 5 PR)
- 신규 PNG: 20장 (4 × 5 PR)

## 2. 영역별 산출물 누적

### Backend (slip-service + shared)

| 신규 파일 | 슬라이스 |
|---|---|
| `SlipController.getOne` + `SlipQueryController.listForQuery` 보강 | SP-08-5-1 |
| `SlipDetailResponse` `from(Slip)` + version + inspectionStatus | SP-08-5-1/2/5 |
| `SlipUpdateController` + `SlipUpdateService` + `SlipUpdateRequest` | SP-08-5-2 |
| `SlipUpdateIT` 9 case | SP-08-5-2 |
| `SlipDeleteController` + `SlipDeleteService` + `SlipDeleteRequest` | SP-08-5-3 |
| `Slip.deleteForPurchase()` 도메인 메서드 | SP-08-5-3 |
| `SlipDeleteIT` 10 case (D1~D9 + D8b CONFIRMED) | SP-08-5-3 |
| `SlipInspectionCtaRegressionIT` 6 case | SP-08-5-4 |
| `UserInternalClient` + `SlipDetailResponse.ownerFullName` | SP-08-5-5 |
| `ErrorCode` 신규: SLIP_OPTIMISTIC_LOCK_CONFLICT, SLIP_UPDATE_INVALID_LINE, SLIP_DELETE_INSPECTION_COMPLETED, SLIP_DELETE_NON_INBOUND | SP-08-5-2/3 |

### Frontend (clients/desktop)

| 신규/수정 | 슬라이스 |
|---|---|
| `PurchaseQueryPage.tsx` 검수 CTA + DataGrid + INSPECTABLE_STATUSES | SP-08-5-1/4 |
| `SlipDetailPage.tsx` 수정 modal + 삭제 modal + 인쇄 버튼 | SP-08-5-2/3/5 |
| `api/slip.ts` updatePurchaseSlip / deletePurchaseSlip | SP-08-5-2/3 |
| `InboundInspectionDialog.tsx` saveMutation invalidate fix | SP-08-5-4 |
| `print/PurchaseSlipPrintPage.tsx` A4 portrait 인쇄 양식 | SP-08-5-5 |
| Playwright 25 case 정적 계약 | SP-08-5-1~5 |

### Design-system + global.css

| 신규 토큰/클래스 | 슬라이스 |
|---|---|
| `--color-warning-*` scale 6 단계 (50/200/300/500/700/800) | SP-08-5-2 |
| `--color-danger-*` scale 6 단계 (50/200/300/500/700/800) + TS mirror | SP-08-5-2/3 |
| `.warning-banner` | SP-08-5-2 |
| `.danger-banner` + `.danger-text` | SP-08-5-3 |
| `.purchase-edit-*` 클래스 | SP-08-5-2 |
| `.purchase-print-*` 클래스 + `@media print` + `@page` | SP-08-5-5 |
| design docs (`print-spec.md`, `tokens.md`, `components.md`) | SP-08-5-5 |

### DevOps

| 변경 | 슬라이스 |
|---|---|
| Flyway: 없음 (BaseEntity deletedAt + slip_audit_logs V18 재사용) | 전체 |
| `.gitattributes` 신규 (`* text=auto eol=lf` + binary + PowerShell CRLF) | SP-08-5-4 |
| CI 24 그룹 모두 SUCCESS 유지 | 전체 |
| GitGuardian 모두 PASS | 전체 |

## 3. 핵심 결정 누적

### 도메인 정책

- **InboundInspection 별도 도메인 부재**: slip-service 내부 `Slip.status` `EDITABLE_STATUSES = {DRAFT, SAVED}` 재사용 (SP-08-5-3 결정)
- **매입 direct PUT/DELETE INBOUND 한정**: `slipType != INBOUND` guard 가 `requireEditable()` 보다 먼저 (SP-08-5-3 ordering)
- **낙관적 잠금**: `updatedAt` 기반 + `ChronoUnit.MICROS` truncation (PG `timestamp(6)` vs Java nano 정밀도 불일치 방지)
- **422 SLIP_UPDATE_INVALID_LINE 계약 보존**: `LineRequest` Bean Validation 어노테이션 미사용, service `validateLines()` 422 단일 책임 (SP-08-5-2 사이클 1)
- **soft delete only**: hard delete / orphan removal 금지, `Slip.markDeleted()` cascade line markDeleted

### UI/UX 정책

- **UUID 사용자 비공개**: 모든 화면/PNG/dev-report 에 비즈니스 식별자 (`slipNo`, `partnerCode`, 거래처명, 모델명) 사용. internal API 응답 UUID 유지 허용 (SP-08-5-1 정책)
- **권한 가드 (매입 direct CRUD)**: `WAREHOUSE / MANAGER / MASTER` — `INVENTORY / SALES / ACCOUNTANT` 403
- **검수 CTA**: SAVED + CONFIRMED 행에만 노출, INSPECTING 이후 미노출
- **409 conflict UX**: "최신 내용 불러오기" + boolean state + `purchaseConflictMessage`/`purchaseDeleteConflict`/`purchaseDeleteInspectionAlert` 분리
- **인쇄 양식**: design-system `<PrintLayout paper="a4-portrait">` 재사용, `paper-a4-portrait` CSS 클래스, `@media print` + `@page` 전체 선언

### CI/DevOps 정책

- **`.gitattributes` LF 통일** + PowerShell *.ps1 CRLF 유지 (Windows 호환)
- **PNG mock 생성**: PowerShell + Malgun Gothic + unicode escape (`feedback_powershell_utf8_writes` 가드)
- **`@MockBean` 외부 client 7~8종**: Eureka 비활성 IT 격리 (`feedback_it_mockbean_external_clients`)
- **dev-report 10 section 표준**: scope / BE / FE / Design / ErrorCode / Verification / UUID / 도메인 정책 / Migration / Follow-up

## 4. 5회차 워크플로우 효율 검증

| 사이클 | Claude 5 + Codex 5 결함 발견 평균 | 1c 결함 fix 평균 | 2c Codex fix 평균 |
|---|---|---|---|
| SP-08-5-1 사이클 1 | 28 (Claude) + 8 (Codex 신규) | 25 | 6 |
| SP-08-5-2 사이클 1 | 24 + 18 | 24 | 18 |
| SP-08-5-3 사이클 1 | 15 + 1 | 11 | 1 |
| SP-08-5-4 사이클 1 | 9 + 0 | 9 | 0 |
| SP-08-5-5 사이클 1 | 19 + 0 | 11 | 0 |

**관찰**:
- SP-08-5-1/2 사이클 2 진입 — 신규 결함 많음 (UUID 정책 + Bean Validation 계약)
- SP-08-5-3/4/5 사이클 1 종료 — 5회차 워크플로우 + 회고 누적 효과 (`feedback_*`) 로 결함 감소
- Codex cross-check 효과: 사이클 1 평균 +5건 신규 발견 (특히 SP-08-5-1/2)
- 사용자 6/7회차 정책 (PR 내 모든 결함 해결 + 자동 머지) — 1c 일괄 fix 패턴 성립

## 5. Follow-up (후속 슬라이스)

| 항목 | 발견 슬라이스 | 우선순위 |
|---|---|---|
| BE 35 IT @MockBean UserInternalClient 일괄 추가 | SP-08-5-5 | P2 |
| `SlipDetailResponse.ownerFullName` 단언 IT 신규 | SP-08-5-5 | P2 |
| warehouse name snapshot (`destinationWarehouseName`) → SlipDetailResponse | SP-08-5-5 | P2 |
| Pretendard self-host 폰트 (`clients/desktop/public/fonts/`) | SP-08-5-5 (기존 이월) | P2 |
| 매입 인쇄 양식 30행 초과 다중 페이지 분할 (`page-break-after`) | SP-08-5-5 | P3 |
| ErrorCode `slip-service` 패키지 이동 검토 (shared 모듈 분리) | SP-08-5-3 | P3 |
| controller utility 추출 (`BaseSlipController`/`SlipHeaderUtils`) | SP-08-5-3 | P3 |
| inspection 후속: legacy GAS 양식 캡처 비교 iteration (3~5회) | SP-08-5-5 | P2 |
| 매입 인쇄 양식 사용자 Edge 캡처 검증 + CSS 미세 조정 | SP-08-5-5 | P2 |

## 6. 시리즈 종료 선언

SP-08-5 매입 CRUD parity 시리즈 — 5 PR 누적 머지 완료. legacy GAS 동등 기능 (R1/R2 조회 + U1 수정 + D1 삭제 + C1 검수 CTA + P1 인쇄 양식) 우리 DB/API 잠금 완료. SP-03 구매관리 회귀 가드 확보.

다음 시리즈: **SP-08-6 매출/회계 CRUD parity** (master plan 참조).

**tech-manager — 2026-05-18**
