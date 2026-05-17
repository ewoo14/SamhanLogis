# SP-08-5 — 매입 CRUD + 입고 검수 CTA parity 잠금

> 작성: 2026-05-17
> 부모 slice: SP-08 legacy GAS DB/API parity
> 도메인: `slip-service` `Slip(type=INBOUND)` + `inventory-service` `InboundInspection`
> 의존: SP-03 구매관리 검수 CTA 정합화(PR #205), SP-08-3/4 슬라이스 운영 패턴

---

## 1. 목적

legacy GAS 구매/매입 시트에서 수행하던 **매입 전표 CRUD + 입고 검수 CTA + 인쇄 양식**을 Samhan Public 서비스 API와 desktop 화면에서 1:1로 잠근다.

| # | GAS 동작 | 우리 endpoint / 화면 | 비고 |
|---|---|---|---|
| R1 | 매입 목록 조회 | `GET /api/v1/slips?type=INBOUND&from=&to=&page=&size=` | 실제 service path는 gateway strip 후 `/slips` |
| R2 | 매입 상세 조회 | `GET /api/v1/slips/{id}` | lines + 거래처 + 검수 CTA 기준 상태 |
| U1 | 매입 수정 | `PUT /api/v1/slips/{id}` | direct edit + optimistic lock |
| D1 | 매입 삭제 | `DELETE /api/v1/slips/{id}` | BaseEntity soft delete only |
| C1 | 검수 CTA | `InboundInspection` 생성/저장/완료 | SP-03 회귀 금지 |
| P1 | 매입 인쇄 | `GET /api/v1/slips/{id}/print` 또는 desktop print view | legacy GAS 양식 parity |

---

## 2. 현황 분석

| 항목 | 확인 결과 | SP-08-5 방침 |
|---|---|---|
| 매입 도메인 모델 | 별도 `PurchaseSlip` 없음. `services/slip-service/.../Slip.java` + `SlipType.INBOUND` 사용 | 신규 entity 생성 금지. 기존 `Slip` 확장 |
| 입고 검수 모델 | `inventory-service` `InboundInspection` 가 INBOUND slipId 기준 1:1 관리 | C1은 `inventory-service` 흐름 회귀 검증 중심 |
| 구매관리 화면 | SP-03 이후 `clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx`가 정식 화면 | SP-08-5-1은 UI 변경 최소화 |
| 목록 API | 기존 `/slips`는 `slipType=INBOUND`, `/slips/query`는 구매관리 풍성한 컬럼 제공 | legacy alias `type=INBOUND`와 권한 정책 잠금 |
| 검수 CTA 권한 | SP-03 결정: `WAREHOUSE / MANAGER / MASTER`, `INVENTORY` 제외 | R1/R2도 동일 정책으로 잠금 |

---

## 3. Sub-task 분해

### SP-08-5-1 — R1/R2 매입 목록·상세 endpoint 잠금

- `GET /api/v1/slips?type=INBOUND&from=&to=&page=&size=` alias 보강
- `GET /api/v1/slips/{id}` INBOUND 상세 권한과 검수 CTA 기준 상태 보강
- 권한: `WAREHOUSE / MANAGER / MASTER`, `INVENTORY` 제외
- IT `SlipQueryPurchaseIT` 5 case
- desktop `PurchaseQueryPage` SP-03 CTA 정적 계약 재검증
- QA PNG 4장 + dev-report

### SP-08-5-2 — U1 매입 수정 direct PUT + optimistic lock

- `PUT /api/v1/slips/{id}` 매입 direct 수정 endpoint 추가
- `updatedAt` 또는 `version` 기반 optimistic lock
- 라인 전체 교체 / 부분 수정 범위는 기존 `Slip` 도메인 메서드와 충돌하지 않게 결정
- audit log 1 revision 기록

### SP-08-5-3 — D1 매입 soft delete + InboundInspection 연계 정합

- `DELETE /api/v1/slips/{id}` 매입 soft delete
- hard delete / orphan removal 금지
- 연결 `InboundInspection` 존재 시 정책 결정: 삭제 차단 또는 canceled 상태 연동
- 검수 완료 매입 삭제 금지 여부를 ErrorCode catalog로 고정

### SP-08-5-4 — C1 검수 CTA 회귀 + InboundInspection 흐름 검증

- SP-03 구매관리 CTA가 `SAVED / CONFIRMED` 행에 유지되는지 검증
- `InboundInspectionDialog` 저장/완료 성공 후 구매관리 query refetch 유지
- inventory-service endpoint path 직접 `/api/v1`와 gateway strip 경로 모두 회귀

### SP-08-5-5 — P1 매입 인쇄 양식

- 매입 전표 인쇄 HTML 또는 print view
- A4 한 장 fit, 거래처/품목/단가/합계/입고창고/검수란 포함
- legacy GAS 양식 캡처와 side-by-side QA PNG

### SP-08-5-6 — 통합 검증 또는 누적 5 PR 대체

- SP-08-5-1~5가 각각 통합 PR 기준 산출물을 갖추면 누적 PR로 대체 가능
- 최종 단계에서 5-team review + N=3 + 5회차 워크플로우 적용

---

## 4. 핵심 패턴

| 패턴 | 적용 |
|---|---|
| BaseEntity 7 audit + Soft Delete only | 신규 삭제/수정에서 hard delete 금지 |
| `@MockBean` 외부 client | slip-service IT에서 product/inventory/notification/partner client 격리 |
| UUID 비공개 | 화면/QA/문서에는 `slipNo`, `partnerCode`, 거래처명 중심 |
| 한국어 운영 문구 | 화면/QA/dev-report/PR 본문 한국어 |
| design-system 우선 | desktop UI 변경 시 `Button`, `Modal`, `DataGrid` 등 기존 컴포넌트 우선 |
| N=3 + 5회차 | Claude review/fix → Codex review/fix 1사이클, 최대 3사이클 |

---

## 5. 위험 요소

| 위험 | 완화 |
|---|---|
| SP-03 검수 CTA 회귀 | 매 슬라이스 Playwright 정적 계약에 `InboundInspectionDialog`, `canInspectInbound`, `INVENTORY` 제외를 포함 |
| `SlipType.INBOUND` vs 별도 entity 혼선 | master plan에 `PurchaseSlip` 신규 금지 명시 |
| 기존 판매/출고 조회 권한 회귀 | INBOUND일 때만 구매 권한 가드 적용 |
| 검수 완료 후 삭제/수정 정책 충돌 | SP-08-5-3/4에서 `InboundInspection` 상태별 정책을 ErrorCode로 고정 |
| UUID 노출 | QA PNG와 Playwright regex로 사용자 표시 UUID 차단 |

---

## 6. 진행 절차

1. SP-08-5-1 R1/R2 endpoint 잠금
2. PR 발행 후 Claude/Codex 양쪽 review/fix 1사이클
3. N=3 안에 0 blocking + CI green 달성
4. 자동으로 SP-08-5-2 진입. blocker/UNSTABLE 시만 개발책임자에게 결정 위임
