# #773 S2b — 일마감 단가변동 재검증 엔진 + 결과 노출

- **일자**: 2026-07-13 · **PR**: #807 · **연관**: #773 스펙 §6.4/§6.5 · 선행 S2a(#806)
- **워크플로우**: Opus 기획+조기 PR → Codex 구현 → Opus 5-agent(FE/BE/Design/DevOps) + BE 심층 → Opus 직접 fix → 라이브 QA → (Codex 5-agent 적대검증 진행) → 0수렴 → 머지. **표준 캐논·단축 없음.**

## 배경
일마감 `getTaxInvoiceDailyDetail`(read-time 조회)에서 세금계산서 라인별 **할인율 재검증**(레거시 Code.js:668-735 단품 분기 포팅) → `확인` 플래그. 마감 금액 불변·무결성 안전(read-time 감사).

## 변경
| 구성 | 내용 |
|---|---|
| `service/DiscountRevalidator`(신규) | 재검증 엔진. 분기: 운임/절삭(true)·구형 NJ/NS/AVX(rate=50)·액세서리(유효단가=납품가)·멀티(고정dc/45)·세트의존(OUT_OF_SCOPE)·default(true). status: VERIFIED/NOT_FOUND/AMBIGUOUS/MISSING_REFERENT/NOT_MEASURABLE/OUT_OF_SCOPE |
| `service/ModelTokenExtractor`(신규) | accounting 로컬 토큰 추출기(product-service 동일 규칙·MSA 경계·shared/common 통합 후속) |
| `service/MonthEndCloseService` | 배선: 라벨→resolveByLabel→productId→applicablePrices(asOf=마감일)+fixedDiscountRates 벌크→그룹별 재검증. effectiveUnitPrice=(공급가액+세액)/수량(VAT포함) |
| `web/dto/DailyClosingDetailResponse.DailyProductLine` | +release/delivery/expected/actual/verified/revalidationStatus(@Schema·enum 노출) |
| `client/ProductClient` | REFERENT_BATCH_MAX public 승격(중복 제거) |

## 리뷰 disposition (R1)
### Opus 5-agent(FE/BE/Design/DevOps) + BE 심층
- **🔴 HIGH H1 VAT 기준**: actualRate 분자가 순액(supplyAmount/qty)이라 레거시 `단가(VAT포함)`와 VAT 배율 어긋남 → **(공급가액+세액)/수량**(VAT포함)으로 fix. 레거시와 파리티 성립(출고가 VAT 기준 무관·면세 자연수렴). BE 리뷰 독립 확증.
- **🔴 HIGH H2 상업멀티 오분류**: `^(AM|NJ|NS|AVX)→50%`가 멀티보다 먼저 발동 → 실 fixture AM 18.8%(전부 상업멀티) 오검증 → OLD_FIFTY `&& !isLegacyMultiPrefix` 가드로 fix. 회귀 테스트 추가. BE 리뷰 실 데이터 실증.
- **🟡 MED**: qty=0 판정불가→`NOT_MEASURABLE`(verified=null·실패와 구분)·actualRate 참고값 Javadoc·정수%≠원 규약·@Schema 6필드+enum.
- **🟢 LOW fix**: MISSING_REFERENT 게이트 출고가만(fixedDc 45폴백)·상수 중복 제거.
- **문서화**: byModel 일-집계 평균(≠라인단위) 엔진 Javadoc 명시.
- **이연(리뷰어 non-blocking·투명)**: HTTP 레이어 IT=S2c·라벨 resolveByLabel N+1 bulk endpoint=후속·FE 타입/mock parity=S2c/S4(FE 미렌더).
- **반증(정상)**: ModelTokenExtractor 파리티·fixedDc null≠0·HALF_UP·SALES/PURCHASE null-fill·asOf·벌크1회·OUT_OF_SCOPE 정직.

### (Codex 5-agent 적대검증 — 진행 중)

## 검증
- **genuine**: `:services:accounting-service:test --rerun-tasks --no-build-cache` → 1200 tests·0 fail·2 skip.
- **라이브 QA**(Docker 실서버·mock OFF): AM160NXVHHH1 상업멀티 → expected 50·actual 50·**verified true·VERIFIED**(H1 VAT+H2 멀티 라우팅 동시 실증)·서비스품목→NOT_FOUND. Swagger UI 스키마 GUI. `docs/qa/773-s2b-revalidation-engine/`. 라이브 QA가 product-service lookup-by-label 500(stale 이미지) 포착·재배포 해소.

## 후속
- **S2c**: totalDiscount 실계산 · SALES/PURCHASE 경로 재검증 · HTTP 레이어 IT · FE 타입/mock parity.
- **후속 백로그**: 라벨 bulk-resolve endpoint(N+1)·byModel min/max 단가 분산 신호.
- **범위 밖**: S1.5(세트 riUsage·거래처 약정DC)·S1d(구형 OLD·실 시트 sync)·S3(검증결과 영속).
