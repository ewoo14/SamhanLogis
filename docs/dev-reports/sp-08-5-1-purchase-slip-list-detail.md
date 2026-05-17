# SP-08-5-1 매입 목록·상세 endpoint 잠금

작성일: 2026-05-17
브랜치: `feat/sp-08-5-1-purchase-slip-list-detail`

## 1. Gap

| 항목 | 확인 결과 | 조치 |
|---|---|---|
| 매입 모델 | 별도 `PurchaseSlip` 없음. `SlipType.INBOUND`가 매입/입고 전표를 담당 | SP-08-5 master plan에 신규 entity 금지 명시 |
| R1 목록 | `/slips`는 `slipType=INBOUND`만 받았고 legacy alias `type=INBOUND`는 없었다 | `type` alias 추가, `slipType` 명시 시 우선 |
| 목록 정렬 | 기본 `PageRequest` 정렬 없음 | `slipDate DESC, seqNo DESC` 적용 |
| R1/R2 권한 | 기존 조회는 인증 사용자 공통 | INBOUND 조회만 `WAREHOUSE / MANAGER / MASTER`로 제한, `SALES / ACCOUNTANT / INVENTORY / PARTNER` 제외 |
| R2 검수 상태 | 상세 응답에 구매관리 검수 CTA 기준 상태가 없었다 | `inspectionStatus` 추가 (`READY` / `NOT_READY`) |

## 2. BE 구현

| 파일 | 변경 |
|---|---|
| `SlipController` / `SlipQueryController` | `type` alias, INBOUND 구매 조회 권한 가드, `slipType` 미지정 시 비허용 role의 INBOUND row 자동 제외, 기본 정렬 추가 |
| `SlipDetailResponse` | internal API 계약용 UUID(`id`, `partnerId`, `sourceWarehouseId`, `destinationWarehouseId`, `deliveryBatchId`) 복원, `InspectionReadyStatus inspectionStatus` 필드 추가. INBOUND `SAVED / CONFIRMED`는 `READY`, 그 외는 `NOT_READY` |
| `SlipQueryPurchaseIT` | 목록 success, 날짜 필터, INVENTORY/SALES/ACCOUNTANT 403, `/slips/query` INVENTORY 403, 상세 lines, SAVED READY, `/slips`/`/slips/query` seqNo DESC, null type INBOUND row 제외, 404 |

## 3. FE 정합 확인

`PurchaseQueryPage`는 UI 변경 없이 기존 SP-03 계약을 유지한다.

| 항목 | 상태 |
|---|---|
| `querySlips({ slipType: 'INBOUND' })` | 유지 |
| `SAVED / CONFIRMED` 검수 CTA | 유지 |
| `InboundInspectionDialog` 연결 | 유지 |
| 성공 후 구매관리 목록 refetch | 유지 |
| UUID 비공개 test id | `slipNo` 기반 유지 |

## 4. QA

| 파일 | 설명 |
|---|---|
| `01-purchase-list.png` | 구매관리 목록 + 페이지네이션 + 공개 구매번호 |
| `02-purchase-detail.png` | 매입 상세 lines + 거래처 + 검수 상태 |
| `03-inspection-cta.png` | SP-03 SAVED/CONFIRMED 검수 CTA |
| `04-inventory-guard.png` | INVENTORY 권한 제외 안내 |
| `05-confirmed-inspection-cta.png` | CONFIRMED 상태 행의 검수 CTA 활성 |

## 5. Verification table

| 검증 | 명령 | 결과 |
|---|---|---|
| RED | `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle-codex'; .\gradlew.bat :services:slip-service:test --tests "*SlipQueryPurchaseIT" --no-daemon --rerun-tasks` | FAIL 6건 (`id` 누락, null type INBOUND row 노출 4건, `/slips/query` seqNo 정렬) |
| GREEN | `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle-codex'; .\gradlew.bat :services:slip-service:test --no-daemon --rerun-tasks` | PASS, `SlipQueryPurchaseIT` 18 tests 포함 |
| Desktop typecheck | `cd clients\desktop; npm run typecheck` | PASS |
| Desktop lint | `cd clients\desktop; npm run lint` | PASS |
| QA PNG | `.\scripts\generate-sp-08-5-1-purchase-slip-list-detail-screenshots.ps1` | PASS, PNG 5장 생성 |
| diff whitespace | `git diff --check` | PASS, CRLF warning only |

## 6. ErrorCode catalog

신규 ErrorCode는 추가하지 않았다. INBOUND R1/R2 권한 거부는 기존 `FORBIDDEN` 403을 사용한다.

## 7. 정책

| 정책 | 내용 |
|---|---|
| 검수 CTA | 구매관리 CTA 기준과 동일하게 `SAVED / CONFIRMED`만 `READY` |
| 권한 | `WAREHOUSE / MANAGER / MASTER`; `SALES / ACCOUNTANT / INVENTORY / PARTNER` 제외 |
| 정책 근거 | 매입 정보는 warehouse 책임 영역이며 legacy GAS 구매관리 표면과 SP-03 입고 검수 CTA 모두 창고/관리자 중심으로 운영 |
| UUID | internal API 응답 UUID(`id`, `partnerId`, warehouseId, `deliveryBatchId`)는 기존 계약으로 유지한다. 화면/testid/label/badge/QA PNG에는 UUID를 노출하지 않고 `slipNo`, `partnerCode`, `modelCode` 등 비즈니스 식별자를 우선한다. |
| 정렬 | 매입 목록은 최신 `slipDate`, 최신 `seqNo` 우선 |

## 8. SP-08-4 + SP-03 회고 회피

| 회고 | 적용 |
|---|---|
| SP-08-4 목록·상세 endpoint 잠금 | R1/R2를 IT로 먼저 고정 |
| SP-08-4 UUID 비공개 | Playwright 정적 계약과 QA PNG에서 공개 구매번호만 표시 |
| SP-03 검수 CTA 회귀 | `PurchaseQueryPage`, `canInspectInbound`, `InboundInspectionDialog`를 정적 계약에 포함 |
| 외부 client IT 격리 | product/inventory/notification/partner client `@MockBean` 적용 |
