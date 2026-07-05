# 2026-07-05 — #8 IllegalState Korean 라운드 findings 처리

## 처리 요약

| 항목 | 판정 | 처리 |
|---|---|---|
| QA — 세금계산서 type 오류 raw echo | fix | `TaxInvoiceService.parseInvoiceType` 의 잘못된 `invoiceType` 메시지에서 raw 입력값을 제거했다. |
| Design P1 — `MigOpsDashboardPage` raw enum | out-of-scope | 실제 노출은 확인됨. 다만 #8 accounting BE IllegalState/입력값 정제 범위가 아니라 MIG-21 FE 관리자 운영 대시보드 라벨 i18n 별도 슬라이스 대상이다. |
| Design P2 — MIG3 "변환" vs "전환" | false-positive | MIG-14/21의 "변환"은 staging 데이터를 도메인 데이터로 conversion 하는 `transformStatus` 개념이고, BE ErrorCode의 "확정 전환 차단"은 분개 확정 상태 전이를 막는 문구다. 같은 개념의 용어 불일치가 아니다. |

## QA fix

- 기존 테스트는 `SALES`/`PURCHASE` 원어 미노출만 단언해 `BAD_ENUM` 같은 raw 사용자 입력값 echo를 잡지 못했다.
- `TaxInvoiceServiceTest.scenario3_createFromRequest_invalidInvoiceType` 에 `BAD_ENUM` raw 값 미노출 단언을 추가했다.
- `TaxInvoiceService.parseInvoiceType` 예외 메시지를 `"세금계산서 종류는 매출 또는 매입만 허용됩니다. 허용되지 않는 종류입니다."` 로 정제했다.

## P1 근거

- `clients/desktop/src/renderer/routes/accounting/admin/MigOpsDashboardPage.tsx` 는 `row.status`, `row.errorCode`, `row.closingKind`, `row.sourceKind` 를 `InlineMetric` 라벨에 그대로 넣는다.
- dashboard-service 계약도 Prometheus label을 DTO로 그대로 전달한다: `TransformStatusMetric.status`, `RejectedMetric.errorCode`, `DailyClosingDiffMetric.closingKind/sourceKind`.
- 따라서 관리자 화면 사용자에게 raw enum/code가 보이는 것은 맞다.
- 그러나 대상 화면은 `docs/dev-reports/mig-21-migration-ops-dashboard.md` 의 MIG-21 운영 지표 화면이고, 이번 #8 BE IllegalState 한국어화/입력 raw 노출 제거 diff와 직접 결합되지 않는다.
- 권고: 후속 FE 슬라이스에서 MigOpsDashboard 전용 라벨맵(`TRANSFORMED`→`변환완료`, `PENDING`→`대기`, `REJECTED`→`제외`, `SALES`→`매출`, `PURCHASE`→`매입`, `TAX_INVOICE`→`세금계산서`)과 errorCode 운영자 표시 정책을 별도로 정한다.

## P2 근거

- `docs/design/mig-14-admin-ui/*` 와 `Mig14AdminShared.tsx` 는 `transformStatus` 라벨을 `변환상태`/`변환완료`로 정의한다. 이는 이카운트 staging row를 도메인 데이터로 변환하는 import/conversion 상태다.
- `shared/common/.../ErrorCode.java` 의 `"차/대 합계 불일치 - 확정 전환 차단"`은 journal 확정 상태 전이 차단 문구다.
- 두 문구는 마이그레이션 데이터 변환과 회계 상태 전이라는 서로 다른 도메인 개념이므로, 이번 라운드에서는 수정하지 않는다.

## 검증

- RED: `.\gradlew.bat :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.TaxInvoiceServiceTest.scenario3_createFromRequest_invalidInvoiceType"` — raw `BAD_ENUM` 미노출 단언으로 실패 확인.
- GREEN: 동일 단위 테스트 PASS.
- BE 전체: `.\gradlew.bat :services:accounting-service:test` — BUILD SUCCESSFUL.
- FE: `cd clients/desktop && npm run typecheck` — PASS.
- FE vitest: `cd clients/desktop && npx vitest run` — 90 files / 609 tests PASS. `MigOpsDashboardPage` 전용 vitest는 현 코드베이스에 없음.
