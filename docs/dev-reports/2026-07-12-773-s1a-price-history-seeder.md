# #773 S1a — dev price_history 시더 + 시점별 정가 조회 endpoint (#800)

- **일자**: 2026-07-12
- **PR**: #800 · **연관**: #773 스펙(`docs/specs/773-...`) · #777 item3(구형 무인상)
- **워크플로우**: 정밀 정찰(S1a 확정) → codex exec 구현(mcp 타임아웃 우회) → Opus 5-agent(BE/QA 라이브/DevOps) → fix → 0수렴 → CI → 머지.

## 배경
#773 일마감 단가 재검증(D1=ⓐ 할인율 재검증)의 referent = product-service `price_history`(인상전 2000-01-01·인상후 2026-04-01). **dev 0행**(실 Google Sheets 자격 없이 실 sync 불가)이 전 하류 blocker. S1a = 결정적 dev 시더로 해소 + S2 감사엔진이 소비할 시점별 정가 HTTP endpoint.

## 변경
| 파일 | 내용 |
|---|---|
| `PriceHistorySeeder`(신규) | HvacProductSeeder 패턴(이중가드 `@Profile("dev")`+`app.product.seed-test-data`·`@Order(200)` product 선행·결정적 UUID native INSERT·멱등·**per-product try/catch 방어**). product마다 인상후(2026-04-01=Product 정가)+인상전(2000-01-01=인상후×0.9 dev fixture). 구형(OLD)은 무인상 1행(#777 item3 ⓒ) |
| `PriceHistoryInternalController`(신규) | `GET /internal/price-history/applicable`(findApplicableLatest) + `POST /applicable-bulk`. 미발견 404(UUID 미노출) |
| `PriceHistoryRepository` | `existsByProductIdAndEffectiveDate`(멱등·Javadoc) |
| `PriceHistoryInternalControllerIT`(신규·5케이스) | 인상전/후·404·bulk·부분응답없음 |
| `PriceHistorySeederIT`(신규·리뷰 fix) | 일반 2행(×0.9)·OLD 1행·멱등·결정적 UUID — 시더 로직 genuine 검증 |

## 리뷰 disposition
- **BE(PASS·P0/P1 없음)**: 이중가드·@Order·결정적 UUID namespace 분리·native INSERT 컬럼 정합(V3 스키마)·404 UUID 미노출·OLD 무인상=실 프로덕션(ProductSheetSyncService beforeIncreaseTabName=null) 미러링 확인. P2-1(부팅 방어)·P2-2(OLD 분기 전용 IT)·P2-3(dev-report)→fix.
- **QA(GREEN·라이브 실증)**: standalone 부팅 price_history **0→200행**(product당 2행·×0.9 전수 대조 mismatch 0·멱등 재부팅 0 중복)·endpoint curl 200(인상후 2026-04-01/인상전 2000-01-01·경계 `<=`·baseline 이전 404·X-Internal-Token 401)·404 UUID 미노출. OLD 분기는 Boot3(표본 OLD 전환)로 1행 실증.
- **DevOps(PASS)**: @Profile("dev") 이중가드로 CI/prod 미실행(구조적)·@Order 충돌 없음(runner 3개·seed 배타)·product-service test 필터없이 전체·CI 27 pass·Flyway 무변경.

## 설계 노트
- **인상전 0.9 = dev fixture 결정적 델타**(실 정책 아님). 실 데이터는 **S1d(Google Sheets sync·자격 필요·격리·별도 운영)**.
- **OLD 무인상 1행**은 실 프로덕션 구조 정확 미러링(#777 item3 ⓒ). HvacProductSeeder는 category=null 시드라 실 dev 부팅서 OLD 미도달 → PriceHistorySeederIT로 분기 검증.

## 후속
S1b(카테고리 정규화 매퍼)·S1c(구성품 baseline)·**S1d(실 시트 sync·자격)** · **S2(재검증 엔진: OUTBOUND SlipLine 기간집계→productId 카테고리+시점정가+dc-config→기대할인 vs 실할인→확인 플래그·legacy Code.js:661-735 포팅)**.

*(PR 본문 "6케이스"는 실제 ControllerIT 5케이스 오기 — 정정.)*
