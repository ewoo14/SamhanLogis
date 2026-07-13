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
| `product-service` `LookupByLabelBulkRequest`(신규 DTO) | `labels: List<@NotNull String>`(1~`ProductService.LOOKUP_MAX`(100)건, 각 원소 최대 200자·null 원소 거부). blank 토큰 유발 라벨은 서비스에서 batch-level `INVALID_INPUT`(단건 parity·R2 정정) |
| `product-service` `LabelResolutionResult`(신규 DTO) | `status`(MATCHED/NOT_FOUND/AMBIGUOUS 문자열 상수)+`productId`+`modelCode` |
| `ProductService.resolveLabel`(신규 private) | 기존 `lookupSummaryByLabel` 의 3단 fallback(catalogExposedModelCode→alias→unique-LIKE) 판정을 **status 반환 헬퍼로 리팩터** — 단건/벌크가 100% 동일 로직 공유 |
| `ProductService.lookupSummaryByLabel`(리팩터) | `resolveLabel` 결과를 그대로 throw 로 변환(BLANK_TOKEN→400/NOT_FOUND→404/AMBIGUOUS→409). 동작 동일 |
| `ProductService.lookupSummaryByLabelBulk`(신규) | 라벨마다 `resolveLabel` 호출, MATCHED/NOT_FOUND/AMBIGUOUS 는 `LabelResolutionResult` 로 보존(부분 성공)·**BLANK_TOKEN 은 단건과 동일하게 batch `INVALID_INPUT` throw**(R2 parity 정정). 중복 라벨은 `computeIfAbsent` 로 1회만 조회 |
| `ProductInternalController` `POST /products/internal/lookup-by-label-bulk`(신규) | 단건 `/lookup-by-label` 유지, 신규 벌크 endpoint 추가. X-Internal-Token 인증(기존 internal 관례) |
| `ProductClient.resolveByLabelBulk(List<String>)`(신규) | 1 HTTP POST → `Map<String, ProductLabelMatch>`. status 문자열은 accounting 자체 `ProductLabelMatch.Status.name()` 과 비교(MSA 경계상 product DTO import 금지 — 문자열 계약만 공유)·**응답 completeness 검사**(요청 distinct 라벨 전부 응답 키 존재·누락 시 `INTERNAL_ERROR` fail-fast·R2) |
| `ProductClient.LABEL_BATCH_MAX = 100`(신규 상수) | product-service `LOOKUP_MAX` 와 동일. 호출측 청킹 기준 |
| `MonthEndCloseService.resolveProductLabels`(리팩터) | 순차 루프 제거 → `labelChunks(labels)` 로 `LABEL_BATCH_MAX` 단위 청크 후 `resolveByLabelBulk` 호출(통상 1회, 하루 배치가 100건 넘는 드문 경우도 무제한 지원 — 결과/판정 무변경) |

## Parity 보장 방식
- 단건(`lookupSummaryByLabel`)과 벌크(`lookupSummaryByLabelBulk`)가 `resolveLabel` 이라는 **동일 private
  메서드**를 호출 — 로직 분기가 아니라 "같은 판정 결과를 throw 로 쓰느냐 status 로 쓰느냐"의 차이만 남도록
  구조적으로 강제했다. divergence 가 생기려면 `resolveLabel` 자체를 건드려야 하므로 리뷰/회귀 시 단일
  지점만 보면 된다.
- 단위테스트로 **동일 라벨에 대한 단건 throw ↔ 벌크 결과 일치**를 MATCHED/NOT_FOUND/AMBIGUOUS(status 보존)·
  BLANK_TOKEN(양쪽 모두 `INVALID_INPUT` throw·R2 정정) 4개 상태 전부 명시적으로 증명(`ProductServiceTest` parity·
  HTTP IT 는 `lookupByLabelBulk_blank토큰이면_400을_반환한다` 로 단건과 동일 400 별도 검증).
- accounting 측은 `MonthEndCloseService.resolveProductLabels` 가 새 벌크 client 1회 호출(통상)로 대체된
  것을 `verify(productClient, times(1)).resolveByLabelBulk(...)` 로 직접 검증(이전 `times(6)` 어서션을
  대체) — N+1→1 전환의 회귀 가드.

## 테스트 (최종·R2/R3 반영)
- **product-service** `ProductServiceTest`: 모델코드/alias/LIKE MATCHED, NOT_FOUND/AMBIGUOUS 구분,
  **blank 토큰 INVALID_INPUT parity**, 혼합 배치, null/빈 리스트, size 상한 초과, 중복 라벨 dedup, 단건↔벌크
  parity 4상태 — **전체 47개, 0-fail**.
- **product-service** `ProductInternalControllerLabelIT`(실 Postgres): 벌크로 exact/alias/다의성/미매칭
  4상태 동시(200) + **`blank토큰이면_400`(단건 parity)** + 빈 리스트 400 + 토큰 누락 401 — **전체 9개, 0-fail**.
- **accounting-service** `ProductClientTest`: `resolveByLabelBulk` 매핑(MATCHED/NOT_FOUND/AMBIGUOUS·레거시
  modelCode null·빈 목록·상한 초과·4xx/5xx·알수없는 status·**응답 라벨 누락→INTERNAL_ERROR**) — **전체 26개, 0-fail**.
- **accounting-service** `DailyClosingDetailServiceTest`: 순차 스텁→벌크 스텁 전환·`times(6)`→`times(1)`(N+1→1)·
  **101 라벨 100/1 청킹+첫청크 병합 가드**(QA mutation B 대응)·**blank 벌크 INVALID_INPUT whole-batch 전파 가드**
  (Design/FE blast-radius 지적 대응) — **전체 10개, 0-fail**.
- **accounting-service** `DailyClosingRevalidationIT`(실 Postgres): `@MockBean` 스텁 벌크 전환 — TAX/SALES/PURCHASE
  3경로 무회귀(전체 4개, 0-fail).

## 리뷰 이력 (캐논)
- **R1(구현)**: backend 서브에이전트 구현(집PC codex exec 다중파일 편집 크래시 회피 env substitution·**착수 전 Codex 실행 미검증 조기 단축이었음·개발책임자 지적**) + Opus STEP4 독립검증.
- **R2(Codex 개발 리뷰·캐논 2단계·소급)**: 건너뛴 2단계 소급 보완. Codex 가 **Opus 5-agent 가 놓친 genuine 다수 포착** — [HIGH] blank-token parity 위반(벌크 soft NOT_FOUND vs 단건 400)·[MED] 벌크 응답 completeness 미검증·[MED] >100 청킹 테스트 부재·[LOW] 단건 Javadoc stale·@Size null-element → Codex fix(6건·`755812fd3`).
- **R3(Opus 5-agent 수렴 재검)**: FE/BE/Design/DevOps/QA 전 차원 0-blocking. genuine non-blocking → Opus fix: 청킹 첫청크 병합 가드(QA mutation)·blank whole-batch 전파 가드(Design/FE)·dev-report 정합(본 문서).
- **R4(Codex 5-agent 적대검증)**: (게시 참조).

## 검증(genuine·`--rerun-tasks --no-build-cache`)
product-service 505·accounting-service 1224(무관 skip 10)·0-fail. CI green at exact SHA(PR 코멘트). 라이브 QA:
일마감 상세 재로드 parity + product-service 로그 벌크 1회 호출 실증(product+accounting 양측 재배포·
[[project_local_stack_qa_gotchas]] §1.5). S2a 와 달리 본 PR 은 같은 커밋에서 소비 배선(getDailyDetail)까지 완료돼
GUI 경로가 신규 코드를 즉시 실행하므로 라이브 QA 를 이연하지 않고 실행(QA 지적 반영).

## 후속
- 순수 배치화(판정/동작 무변경). 단건 `lookup-by-label`/`resolveByLabel` 은 프로덕션 무호출이나 parity 앵커·
  운영 디버깅·향후 단건 소비 대비 유지(제거는 별도 usage 조사 후 deprecated 순서). 200자 초과 검증·전부-괄호
  itemName graceful degradation 여부는 별도 결정 대상(현 slice 는 원본 parity 유지).
