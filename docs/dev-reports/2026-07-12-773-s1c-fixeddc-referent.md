# #773 S1c — 고정dc(fixedDiscountRate) productId 조회 endpoint + dev 시드 (#805)

- **일자**: 2026-07-12
- **PR**: #805 · **연관**: #773 스펙 §5.7 · S1a(#800 납품가 완비)·S1b(#802)
- **워크플로우**: 착수전 정찰(순수조회 판정) → 조기 PR → Codex 구현 → Opus 5-agent → fix → Codex 적대 → 0수렴 → 라이브 QA → CI → 머지.

## 배경
일마감 재검증(D1=ⓐ `확인` 판정)은 정가만으로 불가 — 납품가·고정dc 의존(레거시 Code.js:551-558,680,688,721). S1c = 그 referent 중 **고정dc(fixedDiscountRate)를 productId로 조회하는 순수 조회 인프라**. 납품가는 S1a `/price-history/applicable(-bulk)`가 release/delivery 둘 다 반환해 **이미 완비**(무작업).

## 정찰 판정 (스펙 §5.7)
- **순수조회·무결성 무관** → 개발책임자 정책 게이트 불요(`확인` 계산은 S2·S1c는 값 조회만).
- 고정dc 소스 = `Product.fixedDiscountRate`(product 품목별·NUMERIC 5,2·percent). **dc-config 아님**(=S1.5 약정DC·거래처별).
- 선결 2건: dev 시드 NULL(HvacProductSeeder INSERT 컬럼 누락) + productId 조회 경로 부재.

## 변경
| 구성 | 내용 |
|---|---|
| `ProductInternalController` | `GET /products/internal/fixed-discount-rate`(단건) + `POST /fixed-discount-rate-bulk`. `FixedDiscountResponse(fixedDiscountRate)`·**null=미설정 정상**·productId 미존재만 404 |
| `FixedDiscountRateBulkRequest`(신규) | `@NotEmpty @Size(max=500)` productIds·한글 validation 메시지 |
| `HvacProductSeeder` | native INSERT `fixed_discount_rate` **3곳 동기화**(47=47=47·`has_variable_discount`↔`discount_flags` 사이). 시드 MULTI 45.00(55)·부속 35.00(5)·단일 null(40)·전 NULL 해소 |
| IT | endpoint 7(bulk/단건 percent·null·단건404·bulk404·빈/초과 400·스케일가드) + seeder 3 |

## ⚠️ 스케일 파리티
현대 `fixedDiscountRate`=**percent(45.00)**(V20 마이그 ×100·CHECK 0~100). 레거시 `fixedDc`(분수 0.45)의 ×100 적용본. **S2 재검증이 레거시 `expectRate=round(fixedDc*100)`와 비교 시 이 값은 이미 expectRate 공간 → 재×100 금지**(Javadoc·DTO·IT 가드). V20 CHECK(0~100)는 0.45도 통과시켜 DB만으론 회귀 못 잡음 → **IT `value(45.00)` 단언이 유일 안전망**(QA 확인).

## 리뷰 disposition
### Opus 5-agent R1
- **BE**: native INSERT **47=47=47 그룹별 직접 카운트** 검증·`fixed_discount_rate` 12번째 정확 일치·오염 0. null/bulk404·findById(단종품목 재조회 정합)·시드분류·스케일 전부 정상. dev-report 누락(LOW)→본 문서.
- **Design/API**: [MED] @ApiResponses 404 문구가 실제 예외("고정DC율 조회 대상 품목을 찾을 수 없습니다")·**같은 PR IT와 모순** → 정정. [LOW-MED] DTO명 방향역전 → `FixedDiscountRateBulkRequest` rename(S1a `ApplicablePriceBulkRequest` 패턴). [LOW] validation 한글메시지+400 IT.
- **QA**: [HIGH] **라이브 QA 함정**(시더 idempotency skip·기존 100건 있으면 재시드해도 NULL 유지 오탐) → 라이브 QA 절차 반영. [MED] bulk 전체-404(S1a 선례이나 S2 적합성 미정) → S2 계약 결정사항. tautology 아님·스케일 가드 유효 확인.
- **DevOps**: 0(CI allowlist·마이그 0·@Profile 가드).
### Codex 적대 R1
(라운드 후 반영)

## QA (실 스택 라이브)
- **⚠️ 라이브 QA 절차(QA HIGH 반영)**: 기존 product 100건 삭제/볼륨 리셋 → 재시드 `skipped 0` 확인 → fixed_discount_rate 분포(45.00×55/35.00×5/NULL×40) → endpoint 실증. (idempotency skip 오탐 방지.)
- `/fixed-discount-rate-bulk` 실서버 200 + 스탠드 45.00/부속 35.00/null 혼합 실증 + Swagger GUI 스샷.
- product-service **483→ tests 0-fail**(--rerun-tasks·IT 포함).

## 후속 (스펙 §후속)
- **bulk 전체-404 vs 부분성공**: S2 재검증엔진 착수 시 계약 확정(하루치 배치에 단종 1건 섞이면 전체 막힘 트레이드오프). S1a 선례 재사용 중.
- **S1.5**(dc-config 약정DC)·**S1d**(구형 baseline·실 시트 sync·Google 자격)·**S2**(재검증 엔진: 문서집계→매핑[S1b]→시점정가[S1a]+고정dc[S1c]+납품가[S1a]→기대할인 vs 실할인→`확인` 플래그·Code.js:668-735 포팅).
- 실 삼한 고정dc/납품가·라이브 전량 hit는 S1d(실 카탈로그) 후(dev=삼성유통품 synthetic).
