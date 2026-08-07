# #1069 S1 구현 보고서 — 판매전표 세트 전개

## 범위

- 판매전표 입력 화면에서 BUNDLE 선택 시 저장 경로와 동일한 `ProductClient.expand` 결과를 조회한다.
- 세트 헤드는 화면 state에서 제거하고 구성품 행만 삽입한다.
- 구성품 전개 실패 시 세트 productId를 가진 행을 남기지 않고 사용자 오류를 표시한다.
- 기존 단품 입력, 구성품 단독 입력, 자동 빈행, VAT 포함 금액 계산 경로는 유지한다.

## RED-first 기록

신규 RED 테스트는 다음 두 불변식을 먼저 고정했다.

1. 세트 선택 후 화면에 세트 행이 남지 않고 구성품 행만 보이며 저장 payload에도 세트 productId가 없다.
2. 전개 실패 시 세트 행을 저장하지 않고 사용자에게 오류가 보인다.

최초 실행은 `vitest/config` 의존성 미설치로 테스트 시작 자체가 실패했다. 의존성 설치 후 기능 RED 원문은 다음이었다.

```text
AssertionError: expected '' to be 'Product A'
```

원인은 구현의 wire 계약이 아니라 테스트 fixture가 응답 필드 `name` 대신 `productName`을 사용한 것이었다. fixture를 실제 `ExpandedLineResponse.name` 계약에 맞춘 후 GREEN이 되었다.

## 구현

- `POST /slips/expand-line` facade 추가
  - `parentModelCode`, 수량, VAT 포함 세트 단가, 세트 옵션을 받는다.
  - 저장 시 `SlipService.addSlipLinesExpanded`가 호출하는 동일 `ProductClient.expand` 경로를 사용한다.
- `SlipFormPage`에서 반환 구성품을 `LineDraft`로 변환해 선택 행을 구성품 N행으로 교체한다.
  - trailing 빈행은 `ensureTrailingBlankRow`로 보장한다.
  - 구성품이 없거나 호출 실패하면 세트 productId 없이 오류행을 표시한다.
- 신규 파일
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/ExpandSlipLineRequest.java`
  - `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/ExpandedSlipLineResponse.java`

## 검증

- `./gradlew.bat :services:slip-service:test --tests '*Bundle*' --tests '*SlipLine*' --console=plain` — BUILD SUCCESSFUL
- `clients/desktop`: `npx vitest run src/renderer/routes/SlipFormPage.test.tsx --reporter=dot` — 62 tests passed
- `npx tsc -p tsconfig.web.json --noEmit` — 저장소 기존 `@samhan/design-system` 미빌드로 전체 typecheck는 실패. 변경 파일에서 신규 오류는 확인되지 않았고, 실패는 해당 모듈 미해석 및 연쇄 implicit-any 오류다.

