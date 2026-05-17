# SP-08-6-1 매출 목록·상세 endpoint 잠금

작성일: 2026-05-18
브랜치: `feat/sp-08-6-1-sales-slip-list-detail`

## 1. Gap

| 항목 | 확인 결과 | 조치 |
|---|---|---|
| 매출 모델 | 별도 `SalesSlip` 없음. `SlipType.OUTBOUND` 가 매출/출고 전표를 담당 | SP-08-5 패턴 동일, 신규 entity 금지 |
| R1 목록 | `SlipQueryController.listForQuery` 에 OUTBOUND 분기 존재 | `guardOutboundSalesRead` + `restrictOutboundWhenTypeOmitted` 적용 |
| R1/R2 권한 | OUTBOUND 조회는 `SALES / MANAGER / MASTER` 만 허용 | `SlipSalesAccessGuard` 신규 (INVENTORY/WAREHOUSE 403 차단) |
| 응답 필드 | `salesPersonName` / `businessNumber` / `totalAmount` 등 19개 컬럼 제공 | `SlipResponse` DTO 기존 필드로 충족 |
| CTA 자리 | 출고전환 / 거래명세서 / 계산서 버튼 — SP-08-6-4 연계 예정 | `SHIPPABLE_STATUSES = ['SAVED', 'CONFIRMED']` 자리표시 |
| UUID 비공개 | `data-testid` / 사용자 노출 식별자 모두 `slipNo` 기반 | `toPublicTestId(row.slipNo)` 유지 |

## 2. BE 구현

| 파일 | 변경 |
|---|---|
| `SlipQueryController` | `guardOutboundSalesRead` + `restrictOutboundWhenTypeOmitted` 호출 추가. 기본 정렬 `slipDate DESC, seqNo DESC` |
| `SlipSalesAccessGuard` | 신규. OUTBOUND 조회 권한 정책: `SALES / MANAGER / MASTER` 허용, `INVENTORY / WAREHOUSE` 403 |
| `SlipResponse` | 기존 `salesPersonName` / `businessNumber` / `partnerName` 등 V20 필드 충족 |
| `SlipQueryRedesignSpecIT` | `specIt4_newFieldsResponseSchema` 에서 `salesPersonName` 포함 V20 필드 10개 검증 |

## 3. FE 정합 확인

`SalesQueryPage` 는 `PurchaseQueryPage` 와 대칭 구조로 구현되었다.

| 항목 | 상태 |
|---|---|
| `querySlips({ slipType: 'OUTBOUND' })` | 구현 |
| `canQuerySales` session store boolean | `SALES / MANAGER / MASTER` 허용 |
| `SHIPPABLE_STATUSES = ['SAVED', 'CONFIRMED']` | 자리표시 (출고전환 CTA — SP-08-6-4 연계) |
| `data-testid` UUID 비공개 | `slipNo` 기반 유지 |
| 19개 컬럼 한국어 헤더 | 판매번호 / 거래처 / 거래처코드 / 배송주소 / 품목 / 특이사항 / 금액 / 출고창고 / 출고일자 / 인수자번호 / 전표수정내역 / 감리주소 / 프로젝트명 / 담당자명 / 인쇄 / 입금예정일 / 상태 / 상세 |
| 검색 모달 한국어 라벨 | 판매번호 / 거래처명 / 거래처코드 / 배송주소 / 프로젝트명 |
| Excel-like DataGrid 모드 | 열헤더 필터 + 다중 셀 선택 + Ctrl+C |
| 한국어 에러 메시지 | `판매 전표 목록을 불러오지 못했습니다.` |

## 4. QA

| 파일 | 설명 |
|---|---|
| `01-sales-query-list.png` | 매출 목록 표시 (10건, SALES 권한, slipNo 기반 식별자) |
| `02-sales-detail-view.png` | 매출 상세 (slipNo + 거래처 + 라인 + CTA 자리) |
| `03-cta-shipment-confirm.png` | 출고/거래명세서/계산서 CTA 자리 (SP-08-6-4 예정) |
| `04-permission-guard-inventory.png` | INVENTORY/WAREHOUSE 권한 403 차단 + 역할 비교표 |

### Playwright 5 case (정적 검증)

| Case | 검증 대상 | 단언 내용 |
|---|---|---|
| T1 | BE 계약 | `guardOutboundSalesRead` 호출 + `salesPersonName` + 정렬 |
| T2 | FE 계약 | `canQuerySales` + `slipType: 'OUTBOUND'` + 한국어 라벨 + testid |
| T3 | inventory-service 회귀 | `/deduct` endpoint + `OutboundSlipLineSummary` + `InboundInspectionController` 대칭 |
| T4 | audit + UUID 비공개 | 스크립트 UUID 미포함 + `slipNo` 기반 testid |
| T5 | 권한 가드 | `SALES/MANAGER/MASTER` 허용 + `INVENTORY/WAREHOUSE` 차단 |

## 5. Verification table

| 검증 | 명령 | 결과 |
|---|---|---|
| BE 계약 파일 존재 | `SlipQueryController.java` + `SlipSalesAccessGuard.java` 확인 | PASS |
| FE 계약 파일 존재 | `SalesQueryPage.tsx` + `session.ts canQuerySales` 확인 | PASS |
| QA PNG 생성 | `.\scripts\generate-sp-08-6-1-sales-slip-list-detail-screenshots.ps1` | PASS, PNG 4장 생성 |
| Playwright spec 정적 | `clients/desktop/playwright/sp-08-6-1-sales-slip-list-detail/sp-08-6-1-sales-slip-list-detail.spec.ts` | 정적 단언 5 case 작성 완료 |
| UUID 비공개 | `data-testid` grep — `row.id` 미포함, `row.slipNo` 사용 | PASS |

## 6. ErrorCode catalog

신규 ErrorCode 추가 없음. OUTBOUND R1/R2 권한 거부는 기존 `FORBIDDEN` 403 사용.

## 7. 정책

| 정책 | 내용 |
|---|---|
| 출고전환 CTA | `SHIPPABLE_STATUSES = ['SAVED', 'CONFIRMED']` — SP-08-6-4 에서 실 핸들러 연결 |
| 권한 | `SALES / MANAGER / MASTER`; `INVENTORY / WAREHOUSE / ACCOUNTANT / PARTNER` 제외 |
| 정책 근거 | SP-03 권한 매트릭스 §4.2 — 출고(OUTBOUND) 전표는 영업/관리 직군 전용 |
| UUID | 화면/testid/label/QA PNG 에 UUID 미노출. `slipNo` / `businessNumber` 등 비즈니스 식별자 사용 |
| 정렬 | 매출 목록은 최신 `slipDate DESC`, 최신 `seqNo DESC` 우선 |
| 검색 | 판매번호 / 거래처명 / 거래처코드(사업자번호) / 배송주소 / 프로젝트명 LIKE 다중 검색 |

## 8. SP-08-5 회고 회피

| 회고 | 적용 |
|---|---|
| SP-08-5-1 INBOUND 가드 패턴 | OUTBOUND 도 동일 구조로 `SlipSalesAccessGuard` 대칭 구현 |
| SP-08-5-4 inventory-service 정합 | T3 에서 `/deduct` endpoint + `OutboundSlipLineSummary` 회귀 검증 |
| UUID 비공개 | Playwright T4 + QA PNG 스크립트 모두 `slipNo` 기반, UUID REGEX 미포함 가드 |
| 외부 client IT 격리 | `SlipQueryRedesignSpecIT` 에서 6종 `@MockBean` 이미 적용 |
| 한국어 라벨 | 컬럼 19개 + 검색 모달 + 에러 메시지 + 상태 Badge 모두 한국어 |
