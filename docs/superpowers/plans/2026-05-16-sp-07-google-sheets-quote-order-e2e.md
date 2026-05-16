# SP-07 Google Sheets 견적/주문 E2E 계획

## 1. BE / 계약

- `application.yml`의 bootstrap `range-map`에서 `config:'설정!A1:Z'` 제거.
- 거래처 발송 주문서 GAS와 동일하게 base payload + `*_단가인상` helper map을 prefetch하도록 고정.
- `전표생성폼`, `전표업로드목록`, `종합견적서`가 prefetch 대상이 아님을 주석과 테스트로 고정.
- `BootstrapServiceTest`에서 config seed fallback + DC secret strip을 검증.
- `ProductSheetSyncServiceIT`에서 종합견적서 기본값(`*_단가인상`)과 `인상 전 단가` `PriceHistory` 보존을 검증.

## 2. QA / 테스트

- `clients/desktop/playwright/sp-07-google-sheets-source` static contract 추가.
- partner-order targeted test와 product-service sheet sync IT를 실행한다.
- desktop static contract 병행 실행으로 full menu 회귀를 확인한다.

## 3. Docs / 캡처

- live Google Sheets snapshot 문서 추가.
- operational validation 문서에 secret-bearing/output form 정책 추가.
- SP-07 QA 캡처 6장 이상 생성 후 PR 본문에 raw PNG 링크로 첨부한다.

## 4. PM 통합

- README, ROADMAP, DECISIONS, CURRENT-WORK를 같은 commit에서 갱신.
- GAS UI/기능 변경이 아니며 Notion 통신만 DB/API로 치환한다는 원칙을 문서에 남긴다.
- CI green 확인 후 PM 재점검, 문제 없으면 merge 및 브랜치 정리.
