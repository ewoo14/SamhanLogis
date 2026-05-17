# SP-08-4 — 주문 CRUD parity (legacy GAS 동등 endpoint 잠금)

> 작성: 2026-05-17
> 부모 slice: [SP-08 legacy GAS DB/API parity §5 SP-08-4](2026-05-16_legacy-gas-db-api-parity.md#sp-08-4--주문-crud-parity)
> 도메인: `partner-order-service` (기존 service 확장, 신규 service 없음)
> 의존: SP-07 견적→주문 변환 e2e (PR #209), SP-08-3 시리즈 patterns (PR #213/#214/#215)

---

## 1. 목적

legacy GAS `종합견적서` Spreadsheet + `거래처 발송 주문서` GAS 시트에서 영업/배차 담당자가 수행하던 **주문 CRUD 6 동작** 을 `partner-order-service` REST API 만으로 1:1 잠금:

| # | GAS 동작 | 우리 endpoint (목표) | 비고 |
|---|---|---|---|
| C1 | 견적 → 주문 변환 (GAS 시트 row 복사 + 변환 flag) | `POST /api/v1/partner-orders/from-estimate/{estimateId}` | SP-07 `종합견적서` source tab 와 정합 |
| R1 | 주문 목록 (GAS 시트 행 조회) | `GET /api/v1/partner-orders` | 기존 `PartnerOrderListController` 확장 (legacy filter — 날짜/거래처/상태 GAS 동등) |
| R2 | 주문 상세 (GAS row click) | `GET /api/v1/partner-orders/{id}` | SP-05 `상세` 표면 일관 |
| U1 | 주문 수정 (GAS row edit) | `PUT /api/v1/partner-orders/{id}` | optimistic lock + audit log |
| D1 | 주문 삭제 (GAS row delete) | `DELETE /api/v1/partner-orders/{id}` (soft) | Soft Delete only (`project_build_conventions.md`) |
| P1 | 주문 인쇄 (GAS 양식 export) | `GET /api/v1/partner-orders/{id}/print` 또는 `/print/order/:id` | 인쇄 양식 legacy 100% 매칭 (`feedback_print_design_iteration.md`) |

---

## 2. 현황 분석 (Gap 매핑)

`services/partner-order-service/.../web/` 의 기존 controller:

| Controller | 책임 | SP-08-4 매칭 |
|---|---|---|
| `PartnerOrderListController` | `/api/v1/partner-orders` GET 목록 | **R1 매칭** (legacy filter gap 확인 필요) |
| `PartnerOrderConfirmController` | `/api/v1/partner-orders` POST 확정 | C1 인접 (견적 변환은 별도) |
| `PartnerOrderDraftController` | `/api/v1/partner-orders/drafts` | C1 보조 (draft → confirm) |
| `PartnerOrderHistoryController` | `/api/v1/partner-orders/history` | audit 보조 |
| `PartnerOrderEditRequestController` | `/api/v1/partner-orders` | U1 인접 (request → approve flow) |
| `PartnerOrderBootstrapController` | `/api/v1/partner-orders/bootstrap` | meta lookup |
| `VendorOrderController` | vendor 인쇄/OCR | P1 인접 (vendor 양식) |
| `PartnerOrderAuditLogController` | `/api/v1/partner-orders/{id}` audit | R2 인접 |
| `GateImageController` | gate image | 무관 |

**Gap 추정** (실 grep 후 sub-task 시 확정):

- **R2 주문 상세** — `GET /api/v1/partner-orders/{id}` 직접 endpoint 존재 여부 확인 (목록 + audit log 만 있고 단일 상세 응답 누락 가능성)
- **U1 주문 수정** — `PUT` direct 가 아니라 EditRequest 우회만 있을 수 있음. legacy GAS 는 즉시 row edit → direct PUT 필요
- **D1 soft delete** — `DELETE` endpoint 존재 + Soft Delete 적용 확인
- **C1 견적→주문 변환** — SP-07 PR #209 이관 (estimate-to-order) 의 변환 endpoint 가 partner-order-service 에 잠겨있는지 (또는 임시 script 만 있는지)
- **P1 주문 인쇄** — 단일 주문 print template HTML/PDF endpoint. VendorOrderController 와 분리 여부

---

## 3. Sub-task 분해 (SP-08-3 시리즈 패턴 차용)

### SP-08-4-1 — R1/R2 주문 목록·상세 endpoint 잠금 (보강)

- `PartnerOrderListController` 의 filter 옵션 (날짜 range / 거래처 / 상태 / 검색어) 가 legacy GAS 시트의 필터와 1:1 매핑 확인
- `GET /api/v1/partner-orders/{id}` 단일 상세 endpoint 추가 (or 기존 endpoint mapping 정합)
- Desktop `routes/PartnerOrderListPage.tsx` 또는 동등 화면 2-Tab 패턴 (`실행 | 저장내역` 불필요, 단순 목록 + 상세)
- Playwright spec `clients/desktop/playwright/sp-08-4-1-partner-order-list/`
- QA mock PNG 4장 (목록 / 필터 / 상세 / 검색)
- IT `PartnerOrderListIT` + `PartnerOrderDetailIT` (Testcontainers + @MockBean 외부 client)
- dev-report `docs/dev-reports/sp-08-4-1-partner-order-list-detail.md`

### SP-08-4-2 — U1 주문 수정 endpoint (direct PUT)

- `PUT /api/v1/partner-orders/{id}` — optimistic lock (`updatedAt` 비교) + audit log auto-write
- 기존 `PartnerOrderEditRequestController` 의 우회 flow 와 공존 (legacy 운영자는 direct PUT, 신규 권한 분리 운영은 EditRequest)
- BaseEntity 7 audit + Soft Delete 회귀 없음 확인
- Playwright + QA + dev-report SP-08-3 패턴

### SP-08-4-3 — D1 주문 soft delete + C1 견적→주문 변환

- `DELETE /api/v1/partner-orders/{id}` soft delete (deletedAt + deletedBy 기록)
- SP-07 의 견적→주문 변환 로직을 `POST /api/v1/partner-orders/from-estimate/{estimateId}` 로 정식 endpoint 화 (script/임시 path 가 있다면 정리)
- Playwright + QA + dev-report

### SP-08-4-4 — P1 주문 인쇄 양식 (legacy GAS 100% 매칭)

- `GET /api/v1/partner-orders/{id}/print` — HTML 양식 (CSS print media query) 또는 PDF
- legacy GAS Spreadsheet `종합견적서` 출력 tab 의 print layout 캡처 → mockup → Edge 캡처 → 3~5회 iteration (`feedback_print_design_iteration.md`)
- 인쇄 양식 단위 검증 — A4 한 장 fit, 거래처/품목/단가/합계/날인란
- Playwright + QA PNG (legacy raw vs 우리 양식 side-by-side) + dev-report

### SP-08-4-5 — 통합 PR + 5-team 리뷰 + 머지

- 4 sub-task 누적 후 통합 PR `feat(sp-08-4): 주문 CRUD parity 6 동작 잠금`
- 5-team review (Claude + Codex plugin gpt-5.5 + medium)
- 사이클 N (양쪽 0 결함 + CI 100% 까지 — `feedback_no_conditional_merge.md`)
- 머지 + main 동기화 + SP-08-4 종료

---

## 4. 핵심 패턴 (SP-08-3 시리즈 회고 반영)

| 패턴 | 출처 | 적용 |
|---|---|---|
| BaseEntity 7 audit + Soft Delete | `project_build_conventions.md` | 모든 entity 신규/수정 |
| @MockBean 외부 client 의무 | `feedback_it_mockbean_external_clients.md` | IT 전체 (UserClient/PartnerClient/Aligo/Notion 등 6+종) |
| UUID 비공개 | `feedback_uuid_no_user_visibility.md` | 화면 testid prefix + `toPublicTestId` |
| 한국어 commit/PR | `feedback_korean_commits.md` | 의무 |
| Codex Plugin gpt-5.5 medium override | `feedback_codex_model_auto_switch.md` | 사이클 review/fix 시 |
| 인쇄 양식 3~5회 iteration | `feedback_print_design_iteration.md` | SP-08-4-4 의무 |

---

## 5. 위험 요소

| # | 위험 | 완화 |
|---|---|---|
| 1 | EditRequest flow 와 direct PUT 충돌 (권한 / audit / lock) | SP-08-4-2 에서 role 매트릭스 + audit log 표 명시 |
| 2 | 견적→주문 변환 시 SP-07 source tab 단가 정합 깨짐 | SP-08-4-3 에서 SP-07 contract Playwright cross-check |
| 3 | 인쇄 양식 legacy 양식과 미세 차이 (운영자 손맛 불일치) | SP-08-4-4 에서 raw 캡처 → mockup → 3~5회 iteration |
| 4 | Soft Delete 위반 (물리 DELETE) | review-blocker, Flyway migration / repository diff DELETE statement 신규 0 검증 |
| 5 | partner-order-service 풀빌드 시간 + IT race | targeted test (`--tests`) + Testcontainers reuse |

---

## 6. 진행 절차

1. **SP-08-4-1 codex dispatch** (Plugin `codex:codex-rescue` gpt-5.5 + medium override)
2. PR 발행 → Claude 5-agent + Codex 5-section 양쪽 리뷰
3. 사이클 N (양쪽 0 결함 + CI 100%) → 머지
4. 다음 sub-task (SP-08-4-2 → -3 → -4 → -5 통합) 자동 진입
