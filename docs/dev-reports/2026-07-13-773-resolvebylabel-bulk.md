# #773 후속 — resolveByLabel N+1 → lookup-by-label 벌크 endpoint (#813)

- **일자**: 2026-07-13
- **PR**: #813 · **연관**: #773 스펙 §6(S2 정찰·분할) · S2b(#807/#808 재검증 엔진)
- **분류**: 순수 배치화(동작·판정 무변경) — S2b 리뷰 이연분

## 배경
`MonthEndCloseService.resolveProductLabels(List<String> labels)` 가 일마감 상세(`getDailyDetail`) 1회
로드마다 라벨 수만큼 `productClient.resolveByLabel(label)` 을 **순차 호출(N+1 HTTP)** 했다. 하루치
배치의 고유 품목 라벨 수만큼 product-service 왕복이 발생 — S2a 가 이미 `applicablePrices`/
`fixedDiscountRates` 를 bulk 화한 것과 비대칭이었다. 본 슬라이스는 라벨 해소도 동일한 벌크·부분
성공(partial success) 패턴으로 정렬한다.

## 변경
| 구성 | 내용 |
|---|---|
| `product-service` `LookupByLabelBulkRequest`(신규 DTO) | `labels: List<String>`(1~100건, 각 원소 최대 200자). blank 원소도 request 레벨에서 거부하지 않고 서비스가 소프트 처리 |
| `product-service` `LabelResolutionResult`(신규 DTO) | `status`(MATCHED/NOT_FOUND/AMBIGUOUS 문자열 상수)+`productId`+`modelCode` |
| `ProductService.resolveLabel`(신규 private) | 기존 `lookupSummaryByLabel` 의 3단 fallback(catalogExposedModelCode→alias→unique-LIKE) 판정을 **status 반환 헬퍼로 리팩터** — 단건/벌크가 100% 동일 로직 공유 |
| `ProductService.lookupSummaryByLabel`(리팩터) | `resolveLabel` 결과를 그대로 throw 로 변환(BLANK_TOKEN→400/NOT_FOUND→404/AMBIGUOUS→409). 동작 동일 |
| `ProductService.lookupSummaryByLabelBulk`(신규) | 라벨마다 `resolveLabel` 호출, 예외 대신 `LabelResolutionResult` 로 보존(부분 성공). blank 토큰은 그 라벨만 NOT_FOUND. 중복 라벨은 `computeIfAbsent` 로 1회만 조회 |
| `ProductInternalController` `POST /products/internal/lookup-by-label-bulk`(신규) | 단건 `/lookup-by-label` 유지, 신규 벌크 endpoint 추가. X-Internal-Token 인증(기존 internal 관례) |
| `ProductClient.resolveByLabelBulk(List<String>)`(신규) | 1 HTTP POST → `Map<String, ProductLabelMatch>`. status 문자열은 accounting 자체 `ProductLabelMatch.Status.name()` 과 비교(MSA 경계상 product DTO import 금지 — 문자열 계약만 공유) |
| `ProductClient.LABEL_BATCH_MAX = 100`(신규 상수) | product-service `LOOKUP_MAX` 와 동일. 호출측 청킹 기준 |
| `MonthEndCloseService.resolveProductLabels`(리팩터) | 순차 루프 제거 → `labelChunks(labels)` 로 `LABEL_BATCH_MAX` 단위 청크 후 `resolveByLabelBulk` 호출(통상 1회, 하루 배치가 100건 넘는 드문 경우도 무제한 지원 — 결과/판정 무변경) |

## Parity 보장 방식
- 단건(`lookupSummaryByLabel`)과 벌크(`lookupSummaryByLabelBulk`)가 `resolveLabel` 이라는 **동일 private
  메서드**를 호출 — 로직 분기가 아니라 "같은 판정 결과를 throw 로 쓰느냐 status 로 쓰느냐"의 차이만 남도록
  구조적으로 강제했다. divergence 가 생기려면 `resolveLabel` 자체를 건드려야 하므로 리뷰/회귀 시 단일
  지점만 보면 된다.
- 단위테스트로 **동일 라벨에 대한 단건 throw ↔ 벌크 status 일치**를 MATCHED/NOT_FOUND/AMBIGUOUS/
  BLANK_TOKEN 4개 상태 전부 명시적으로 증명(`ProductServiceTest` parity 4종).
- accounting 측은 `MonthEndCloseService.resolveProductLabels` 가 새 벌크 client 1회 호출(통상)로 대체된
  것을 `verify(productClient, times(1)).resolveByLabelBulk(...)` 로 직접 검증(이전 `times(6)` 어서션을
  대체) — N+1→1 전환의 회귀 가드.

## 테스트
- **product-service** `ProductServiceTest`: 모델코드/alias/LIKE MATCHED 각각, NOT_FOUND/AMBIGUOUS 구분,
  blank 토큰 소프트 처리, 혼합 배치, null/빈 리스트, size 상한 초과, 중복 라벨 dedup, 단건↔벌크 parity
  4종 — 신규 14개 테스트(전체 47개, 0-fail).
- **product-service** `ProductInternalControllerLabelIT`(실 Postgres): 벌크 endpoint 로 exact/alias/
  다의성/미매칭/blank 5상태 동시 검증 + 빈 리스트 400 + 토큰 누락 401 — 신규 3개(전체 8개, 0-fail).
- **accounting-service** `ProductClientTest`: `resolveByLabelBulk` 매핑(MATCHED/NOT_FOUND/AMBIGUOUS·
  레거시 modelCode null·빈 목록·상한 초과·4xx/5xx·알수없는 status) — 신규 7개(전체 25개, 0-fail).
- **accounting-service** `DailyClosingDetailServiceTest`: 기존 `resolveByLabel` 순차 스텁 전체를
  `resolveByLabelBulk` 벌크 스텁으로 전환. 핵심 회귀 가드 — `times(6)` → `times(1)` 어서션 변경으로
  N+1→1 전환을 직접 증명(전체 8개, 0-fail).
- **accounting-service** `DailyClosingRevalidationIT`(실 Postgres): `@MockBean ProductClient` 스텁을
  `resolveByLabelBulk` 로 전환 — TAX_INVOICE/SALES_SLIP/PURCHASE_SLIP 3경로 무회귀 확인(전체 4개, 0-fail).

## 검증(genuine)
```
./gradlew :services:product-service:test :services:accounting-service:test --rerun-tasks --no-build-cache
```
컴파일(compileJava/compileTestJava) 및 전체 테스트 스위트 통과 확인(상세 수치는 PR 코멘트 참조).

## 후속
- 없음(순수 배치화 슬라이스, 판정/동작 변경 없음). 라이브 QA 는 S2b/S2c 선례와 동일하게 순수 client
  리팩터라 GUI 표면이 없어 이연 — product/accounting IT(실 Postgres) 로 계약 검증 완료.
