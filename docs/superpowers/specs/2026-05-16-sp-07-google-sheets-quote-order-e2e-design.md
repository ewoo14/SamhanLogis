# SP-07 Google Sheets 견적/주문 E2E 설계

## 배경

개발책임자는 종합견적서와 주문서가 Google Spreadsheet 데이터를 그대로 가져오는지 재검증하라고 요청했다. 최신 기준은 더 명확하다. GAS의 UI와 기능은 그대로 유지하고, Notion 통신만 Samhan DB/API 통신으로 바꾼다. Google Sheets는 legacy GAS source tab 검증/동기화 원천이고, Samhan Public 운영 화면과 API는 서비스 DB/캐시 계약을 통해 동작한다.

## 목표

- live Google Sheets connector로 `종합 견적서` spreadsheet metadata/range를 재검증한다.
- `종합견적서`, `전표업로드목록`, `전표생성폼`을 카탈로그 source가 아닌 output/control form으로 분리한다.
- `partner-order-service` bootstrap prefetch에서 credential-bearing/control form을 읽지 못하도록 계약화한다.
- `ProductCatalogLookupClient`, `BootstrapService`, `ProductSheetSyncService`의 column mapping과 current/base 가격 보존 방식을 테스트/문서/캡처로 고정한다.

## 범위

| 구분 | 포함 |
|---|---|
| BE | `partner-order-service` bootstrap range-map 보안 보정, `product-service` `PriceHistory` current/base 보존, 계약 테스트 강화 |
| QA | Playwright static contract, live connector snapshot 문서, 상세 PR 캡처 |
| Docs | operational validation, dev-report, README/ROADMAP/DECISIONS/handoff |

## 비범위

- Google Sheet 자체 편집.
- 외부 Service Account 키 값 게시.
- 주문/견적 UI 신규 기능. 기존 GAS UI/기능을 바꾸지 않는다.

## 수용 기준

- `전표생성폼`, `전표업로드목록`, `종합견적서`는 bootstrap range-map과 catalog lookup source에 포함되지 않는다.
- `config`는 sheet read가 아니라 seed fallback + DC secret strip을 따른다.
- 종합견적서 기본 단가는 `*_단가인상`이며, base tab은 `인상 전 단가`용 `PriceHistory`로 보존된다.
- live snapshot에는 spreadsheet tab 목록과 안전한 제품 샘플만 기록되고 credential/개인 연락처 값은 없다.
- PR 캡처는 6장 이상이며, 각 캡처가 source tab, output/control form, 서비스 반영 지점, 검증 matrix를 분리해 보여준다.
