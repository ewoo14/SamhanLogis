# SP-08-4-4 주문 인쇄 양식 dev-report

## 1. Gap

legacy GAS 주문 흐름에는 `종합견적서` 계열 출력 tab 이 있었지만 Samhan Public `partner-order-service`에는 단일 주문을 브라우저에서 바로 인쇄하는 endpoint 가 없었다. SP-08-4-1~3에서 목록/상세/수정/삭제/견적변환은 잠겼고, 본 슬라이스는 P1 주문 인쇄 양식을 추가한다.

## 2. BE 구현

- `GET /api/v1/partner-orders/{id}/print`
- `PartnerOrderPrintController`
- `PartnerOrderPrintService`
- 응답: `text/html;charset=UTF-8`
- 조회: `PartnerOrderIdResolver.findByIdentifier` 재사용
- soft-delete: `@SQLRestriction("is_deleted = false")` 조회 제외로 404

## 3. FE 구현

- `SalesPartnerOrderDetailPage` 상단 액션에 `인쇄` 버튼 추가
- 노출 role: `SALES / MANAGER / MASTER / PARTNER`
- 동작: `/api/v1/partner-orders/{id}/print` 새 탭 열기
- design-system `Button` 사용, inline style 0건

## 4. Print stylesheet

- BE HTML inline CSS: `@media print`, `@page { size: A4; margin: 0; }`
- FE 계약 파일: `clients/desktop/src/renderer/components/sales/print.module.css`
- A4 기준: `210mm x 297mm`
- 포함 영역: 거래처 정보, 주문번호/날짜/납기, 품목 테이블, 소계/부가세/합계, 사용자/거래처 날인란
- 폰트: Pretendard 우선, Malgun Gothic fallback

## 5. QA

- IT 5 case:
  - `testPrintSuccessHtmlReturns200`
  - `testPrintNotFoundReturns404`
  - `testPrintSoftDeletedReturns404`
  - `testPrintPartnerRoleSeesOwnOrderOnly`
  - `testPrintHtmlContentContainsOrderNumber`
- Playwright static contract 5 case:
  - BE GET `/print` contract
  - FE 인쇄 버튼
  - print stylesheet `@media print`
  - A4 layout 정합
  - PARTNER 본인 주문 제한
- QA PNG 4장:
  - `01-desktop-print-preview.png`
  - `02-a4-order-print-form.png`
  - `03-partner-own-order-print-success.png`
  - `04-partner-other-order-print-403.png`

## 6. Verification table

| 항목 | 명령 | 결과 |
|---|---|---|
| BE IT | `.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderPrint*" --no-daemon --rerun-tasks` | PASS |
| Desktop typecheck | `npm run typecheck` | 실행 예정 |
| Desktop lint | `npm run lint` | 실행 예정 |
| QA PNG | `.\scripts\generate-sp-08-4-4-order-print-form-screenshots.ps1` | PASS |
| diff whitespace | `git diff --check` | 실행 예정 |

## 7. ErrorCode catalog

- 404: `PARTNER_ORDER_NOT_FOUND`
- 403: `FORBIDDEN`
- 신규 ErrorCode 없음. 도메인 특화 메시지는 `AccessDeniedException`으로 전달한다.

## 8. 정책

`PARTNER` role 은 본인 거래처 주문만 인쇄할 수 있다. 서버는 `X-Partner-Code`와 주문의 `partnerCode`를 비교하고 불일치 시 403을 반환한다. 내부 운영 role(`SALES / MANAGER / MASTER`)은 주문 인쇄가 가능하다.

## 9. SP-08-4-3 회고 회피

- route id는 기존 상세 path param `orderId = id!`를 그대로 사용해 UUID 화면 노출을 만들지 않는다.
- 삭제 버튼의 `danger` variant 정책과 분리해 인쇄 버튼은 `secondary` variant로 배치했다.
- 새 탭 URL은 `encodeURIComponent(orderId)`로 통일했다.
- Playwright는 Codex sandbox EPERM 회피를 위해 정적 계약 spec만 추가하고 CI 검증에 위임한다.
