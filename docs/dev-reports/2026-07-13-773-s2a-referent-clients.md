# #773 S2a — accounting ProductClient S1a/S1c referent 조회 배선 + bulk 부분성공 계약 (#806)

- **일자**: 2026-07-13
- **PR**: #806 · **연관**: #773 스펙 §6(S2 정찰·분할) · S1a(#800)·S1c(#805)
- **워크플로우**: 정찰(§6) → 조기 PR → Codex 구현 → Opus 5-agent(bulk 전체404 포착) → fix(부분성공·개발책임자 결정) → 재리뷰(범위점증) → Codex 적대(soft-delete 비대칭 포착) → 재fix → 0수렴 → CI → 머지.

## 배경
#773 S2 재검증 엔진 착수(개발책임자 결정 S2a+b+c 순차). referent(S1a 시점정가/납품가·S1c 고정dc)는 product-service 완비·accounting은 S1b resolveByLabel만 배선. S2a = S1a/S1c 조회 메서드 신설(S2b 재검증 엔진이 productId→referent 체인 호출용). 순수 조회·무결성 무관.

## 변경
| 구성 | 내용 |
|---|---|
| `ProductClient.applicablePrices(productIds, asOf)` | S1a bulk `POST /price-history/applicable-bulk` → `Map<UUID, ApplicablePrice{release,delivery,effectiveDate}>` |
| `ProductClient.fixedDiscountRates(productIds)` | S1c bulk → `Map<UUID, BigDecimal>`(null 보존=미설정·percent 45.00 재×100 금지) |
| `ApplicablePrice`(신규 record) | wire 사본 |
| **product bulk 부분성공**(계약 변경) | applicable-bulk·fixed-discount-rate-bulk가 결측 productId **전체404→Map 생략**(있는 것만). 단건 GET은 404 유지 |
| **soft-delete 정합** | applicable-bulk에 `findApplicableIfPresent` 진입부 `productRepository.findById().isEmpty()` 게이트(fixed-discount `@SQLRestriction`과 대칭·단종 품목 양쪽 생략) |

## 리뷰 disposition
### Opus 5-agent R1
- **[핵심·BE MED+QA P2 수렴] bulk 전체-404** — productId 1건 결측→전체 404(마감 500건 배치에 결측 1건이면 재검증 전체 막힘). S1c 때 "S2 계약 결정" 미룬 지점 현실화. **개발책임자 결정=부분성공**(product 2 bulk 결측 생략·단건 404 유지·fixed-discount null(미설정)≠생략(미존재) 구분).
- [LOW·BE] productIds 원소 null 방어(NPE→BusinessException). [LOW·BE+QA] 4xx/5xx·가드 테스트 대칭 8. wire 계약(필드명·percent·batch 500) product측 직접 대조 clear. QA 라이브 QA=S2b/S2c 이연(순수 client·소비자 0).
- **범위 점증**(client→product bulk 계약)→정식 재리뷰 재가동.
### Codex 적대 R1
- A~D 동의(부분성공·null≠생략·단건404 유지·client 수용). 직접 IT 실행 6+9+18·0-fail.
- **[MEDIUM·CONFIRMED] soft-delete 비대칭** — applicable-bulk는 PriceHistory만 조회(Product 조인無)→soft-deleted 가격 반환·fixed-discount는 findById+@SQLRestriction 생략. → **재fix**(applicable-bulk Product 게이트 대칭·단종 생략 IT+entityManager.clear() false-green 방지·자체 발견). [LOW] class Javadoc 정정.
- **재수렴 0**(재fix 후 대칭 IT 0-fail·Codex 지적 해소).

## 검증
- product+accounting 타깃 IT/client **0-fail**(--rerun-tasks --no-build-cache): applicableBulk partialMap/mixedBatch/softDelete·fixedDiscountRateBulk partialMap/null≠생략·에러 대칭 8·client 부분수용.
- 라이브 QA=S2b/S2c 이연(QA 판단·순수 client·GUI/curl 표면 없음·product측 계약 자체 IT 검증됨).

## 후속
- **S2b**(재검증 엔진 본체): getTaxInvoiceDailyDetail per-line itemName→resolveByLabel→productId→(applicablePrices+fixedDiscountRates)→기대(expectRate) vs 실(actualRate=supplyAmount/quantity)→`확인`. 부분성공 계약 소비(결측=재검증 대상외·keySet 차집합). 레거시 Code.js:668-735 단품 분기 포팅.
- **S2c**: DailyProductLine 필드 확장+totalDiscount 실계산. **S1.5**(세트/약정DC)·**S3**(검증결과 영속)·**S1d**(구형/실sync)는 범위 밖.
