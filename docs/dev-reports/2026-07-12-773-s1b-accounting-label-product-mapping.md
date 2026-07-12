# #773 S1b — 회계 라벨→모델코드 토큰→productId 매핑 endpoint (#802)

- **일자**: 2026-07-12
- **PR**: #802 · **연관**: #773 스펙 §5(S1 심화 정찰·D5=텍스트매칭·ⓑ IT픽스처) · S1a(#800 price_history)
- **워크플로우**: 3+1 정찰(referent 갭 규명) → 조기 PR → Codex 구현 → Opus 5-agent(HIGH modelCode-null 등 4 fix) → Codex 적대(A~D 독립동의·0) → 0수렴 → 라이브 스모크(4상태) → CI → 머지.

## 배경
#773 일마감 단가 재검증(D1=ⓐ)의 referent = product-service `price_history`(시점정가·S1a). 마감 집계 문서(`TaxInvoiceLine.item_name`·`SalesAccountingSlipLine.product_name`)에 **productId 미보존**(텍스트 `품목명[규격]` 라벨만) → 시점정가 join 불가. S1b가 앞단 **라벨→productId 매핑**을 깐다(개발책임자 D5=텍스트매칭 endpoint·ⓑ IT픽스처).

## 변경
| 파일 | 내용 |
|---|---|
| `ModelTokenExtractor`(product·신규) | 레거시 Code.js:161-174 순수 포팅. 괄호3종 제거→대문자→모델코드 정규식 `(AC\|AP\|AR\|AF\|AM\|AJ\|AXJ\|PC\|AWR\|ARR)[A-Z0-9-]{4,}`→AR-/ARR- 특례→전체명 fallback |
| `ProductService.lookupSummaryByLabel` | 토큰추출→3단 fallback(`findByCatalogExposedModelCodeAndIsDeletedFalse`=modelCode→modelName exact / `productAliasRepository.findByAliasCodeAndIsDeletedFalse` / `search` LIKE 단건성). blank토큰 400·미매칭 404·LIKE 2건+ 409 |
| `LookupByLabelRequest` + `POST /products/internal/lookup-by-label` | @Valid·@Operation·형제 endpoint 문구 컨벤션 |
| accounting `ProductClient.resolveByLabel` + `ProductLabelMatch` | **사유보존 result**(enum Status MATCHED/NOT_FOUND/AMBIGUOUS)·non-null 반환·modelCode null 허용·404→NOT_FOUND/409→AMBIGUOUS |

## 정찰 (착수 전 blocker 규명)
- **회계 라인 productId 전무 확증**(스펙 §5.1). 텍스트 실값 = 이카운트 `품목명[규격]` 원문(미정규화)·slip product_code="MIG4" 하드코딩(조인 무용).
- **product 조회 자산 다수 기존**(§5.2): `/lookup-by-model`·`/lookup-by-code`·`/by-name`·`resolve-ecount-aliases`. 4단 fallback 중 3단 이미 존재 → 신규는 `ModelTokenExtractor`만.
- **레거시 매칭 = 4단 fallback + 토큰 정규화**(§5.3·단순 exact 아님). `확인` 판정은 정가 외 납품가·고정dc 필요(S1c/S1.5 후속).
- 🚨 **dev 데이터 세계 불일치**(§5.5): dev product=삼성 유통품(model_code NULL)·레거시 AC모델코드 0. 실 계산서 xlsx 라벨 267개 IT 픽스처로 genuine 검증·라이브 전량 hit는 S1d 유예.

## 리뷰 disposition
### Opus 5-agent R1 — HIGH 포착(BE+QA+Design 3렌즈 수렴)
- **[HIGH] modelCode=null 정상매칭 → 500 오분류**: modelName fallback으로 매칭한 레거시 제품(modelCode=null)을 accounting `resolveByLabel`이 INTERNAL_ERROR로 둔갑 → **S1b 존재 이유 배반**. dev seed 100% model_code NULL이라 라이브 100% 재현될 지뢰(IT가 modelCode 세팅 fixture만 써서 은폐). → `ProductLabelMatch` 사유보존 result 재설계·modelCode null 검증 제거·404/409 사유보존(Design P2 동시해소).
- **[MED] alias(2단) fallback 테스트 0** → alias IT. **[MED] ModelTokenExtractorTest 순환+AR-데드분기** → 경계매칭+AR- 실도달 케이스. **[LOW] @ApiResponses 문구** → 형제 컨벤션 정합.
- BE 판정요청(LIKE substring·`.or()` CONFLICT·이스케이프·readOnly) 코드검증 후 false-positive 정리.
- DevOps 0·FE N/A(순수 internal).
### Codex 적대 R1 — 0 findings
gpt-5.5·`codex exec`. A~D 전부 독립 동의(`javap`류 실검증)·`search` 인자순서 일치·Java regex↔Code.js 등가 확증·직접 테스트 실행 통과. 신규 5차원 0 → **0수렴**.

## QA (실 Docker 라이브 스모크·신 jar `85be81c2f`)
`docs/qa/pr-802/live-smoke-lookup-by-label.md`. 4상태 실서버 실증:
- **① modelName-fallback 200**(HIGH 라이브 종단): `AR09TXEAAWKNEU-04 [테스트]`→200·**modelCode=null**(레거시 제품 정상매칭 실증).
- ② 미매칭 404 · ③ 토큰추출불가 400 · ④ 토큰누락 401.
- 변경 모듈 전체 `product 475 + accounting 1175 tests 0-fail`(--rerun-tasks --no-build-cache·IT 포함).

## 후속 (스펙 §5.4)
- **S1c**: 납품가·고정dc referent 소스(`확인` 판정 3종값). **S1.5**: dc-config 검증+이카운트 거래처코드→partnerId+역-BundleExpander 세트 매처. **S1d**: 구형 baseline+실 시트 sync(Google 자격·격리). **S2**: 재검증 엔진(문서집계→매핑[본 S1b]→시점정가→기대할인→`확인` 플래그).
- LIKE substring 정밀도(1건 오매칭 가능성)는 S1c/S1.5 확인 정확도 슬라이스에서 dc-config 정합과 함께.
