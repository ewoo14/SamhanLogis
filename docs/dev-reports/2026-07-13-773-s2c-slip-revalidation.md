# #773 S2c — 전표(매출/매입) 경로 재검증 + HTTP IT + FE 타입 parity

- **일자**: 2026-07-13 · **PR**: #808 · **연관**: #773 스펙 §6.6 · 선행 S2b(#807)
- **워크플로우**: Opus 기획+조기 PR → Codex 구현 → Opus 5-agent(FE/BE/Design/DevOps/QA) + BE 심층 + fix + 게시 → Codex 5-agent 적대검증(R2) + fix + 게시 → Codex 수렴검증(R3) 0수렴 → PM 종합 9-게이트 → CI green → 머지. **표준 캐논·단축 없음·순차.**

## 배경
S2b 는 세금계산서(TAX_INVOICE) 일마감 detail 만 재검증 필드를 노출했다. S2c 는 동일 read-time 재검증 엔진을 **매출전표(SALES_SLIP)·매입전표(PURCHASE_SLIP)** 경로로 확장하고, HTTP 직렬화 계약을 IT 로 고정하며, FE 타입/mock 을 실 BE 직렬화와 정합시킨다. 마감 금액 불변·무결성 안전(read-time 감사) 유지.

## 변경
| 구성 | 내용 |
|---|---|
| `service/MonthEndCloseService` | `revalidateProductLines(byModel, asOf)` 헬퍼를 `getTaxInvoiceDailyDetail` 인라인에서 추출 → TAX_INVOICE·SALES_SLIP·PURCHASE_SLIP **3경로 공유**(byte-for-byte 동일 동작·회귀 0). `accumulateProduct` 가 라인 `vatAmount` 누적 → `effectiveUnitPrice=(공급가액+세액)/수량`(VAT포함) 파리티. |
| `web/dto/DailyClosingDetailResponse` | 클래스/`DailyProductLine` Javadoc 에 **PURCHASE(매입) 유의 캐벗**: release/delivery/fixedDc referent 는 삼한 판매(출고) 기준이라 매입 재검증의 verified/expectedRate 는 **참고용**(정식 매입단가 감사 아님). S4 렌더 전 노출 방식 개발책임자 확정 대상. |
| `it/DailyClosingRevalidationIT`(신규) | @SpringBootTest+MockMvc+Testcontainers. TAX_INVOICE·SALES_SLIP·**PURCHASE_SLIP** 3소스 재검증 6필드 직렬화 + 권한(accounting.reports VIEW 미보유 403). @MockBean 16개 격리. |
| `clients/desktop/api/closingApi.ts` | `DailyProductLine` releasePrice/deliveryPrice/quantity/supplyAmount → `number`(실 BE=BigDecimal→JSON number), modelName `string|null`, `DailyProductRevalidationStatus` union(6값). |
| `clients/desktop/api/mock.ts` | daily fixture 를 재검증 엔진 정합(AM 상업멀티 45% VERIFIED + 미등록 서비스품목 NOT_FOUND)·숫자값·합계 정합으로 교체. |

## 리뷰 disposition (0수렴)
### R1 — Opus 5-agent(FE/BE/Design/DevOps/QA) + BE 심층
- **🔴 HIGH(FE) 타입 오류 fix**: releasePrice/deliveryPrice 가 `string` 선언이나 BE 는 JSON **number**(라이브 실 응답 `releasePrice=11572000.0` 실측 확증) → `number|null` 정정·소비처 sweep(S4 크래시 방지). 부모 totals=렌더 스코프 밖 유지.
- **🟡 MED(Design) mock 엔진 불일치 fix**: VERIFIED 예가 default 분기(도달불가 expectedRate)라 IT 와 동일 AM 상업멀티 45% 로 교체·합계 정합.
- **🟢 LOW(Design) fix**: 클래스 Javadoc SALES 편향 → PURCHASE 포괄.
- **flag(비차단·개발책임자)**: ① totalDiscount '총 할인' 정의(§6.6.1 placeholder ZERO) ② PURCHASE 재검증 의미론(참고용·S4 노출 방식 확정 대상).
- **반증(정상)**: `revalidateProductLines` 리팩터 byte-for-byte·vatAmount threading·IT genuine·@MockBean 완전·마이그 무변경(v56).

### R2 — Codex 5-agent 적대검증 (genuine `codex exec` gpt-5.5 high·0 DLL)
- R1 fix 전건 반증 실패=견고(리팩터·VAT 파리티·FE number·PURCHASE 캐벗·부모 totals 분리).
- **🟡 유일 Low(QA) fix**: PURCHASE_SLIP HTTP IT 부재(§6.6.3 3소스 대비 2소스) → **수용·수정**(독단 무마 금지): `purchaseSlipDailyDetailExposesRevalidationFields`+`seedPostedPurchaseSlip` 추가로 3소스 충족.
- **genuine 부수확(계약)**: HTTP IT 가 실 HTTP 스택(컨트롤러 enum 바인딩·`@RequirePermission` 게이트·JSON 직렬화·실 DB 왕복)을 관통 검증. 특히 **컨트롤러 `kind` 기본값 바인딩** 고정: `sourceKind=PURCHASE_SLIP` 만 보내고 kind 생략 시 기본 SALES resolve → `validateKindSourceMatch(SALES, PURCHASE_SLIP)` → 400. 그래서 IT 는 `.param("kind","PURCHASE")` 동반. 서비스 단위테스트는 3-arg `getDailyDetail(DATE, PURCHASE, PURCHASE_SLIP)` 정합쌍 명시 전달로 계약 통과(우회 아님)하나 컨트롤러/직렬화/권한 계층 미검증 → IT 가 그 계층 genuine 커버. 계약 자체는 정상. FE 소비처(`DailyClosingPage.tsx` compatibleSource)는 항상 kind=PURCHASE 동반 → 실앱 400 회귀 없음.

### R3 — Codex 수렴검증 (fix 반증)
- 5차원 전부 `0·문제 없음`(confidence high). 신규 IT 가 6필드를 실 repository 저장→조회 경로로 genuine 검증·AM160 판정 서비스테스트와 일치·spec 정합 과장 없음.
- **부수 확증**: desktop 소비처 `DailyClosingPage.tsx:125` 도 PURCHASE_SLIP 조회 시 kind 동반 전달 → 실앱 400 회귀 리스크 없음. **→ 0수렴 선언.**

## 검증
- **genuine**: `:services:accounting-service:test --rerun-tasks --no-build-cache` → **1207 tests·0 fail·2 skip**(신규 `DailyClosingRevalidationIT` 4/4 포함). FE `npm run typecheck` 통과. CI 전 체크 green(HEAD 7be6f15a·accounting+partner 빌드/JUnit/Frontend Desktop).
- **라이브 QA**(test-only 라운드 disposition): R1 authoritative(Docker :8087 배포 jar·mock OFF → TAX_INVOICE AM160 release 11,572,000·VERIFIED·number 직렬화). R2/R3=테스트 순증분(main byte-identical·jar 무재배포·:8087 동일 jar Up·healthy)라 R1 라이브 유효 유지. SALES/PURCHASE 라이브=dev 0행(§6.6.2)→genuine IT 커버. 재검증 필드 GUI 렌더=S4 이연(신규 표시 GUI 부재).

## 후속
- **S3**: 검증결과 영속(단가변동 확인 상태 저장·재조회).
- **S4**: FE 렌더(재검증 컬럼·매입 노출 방식 개발책임자 확정 후)·totalDiscount 실계산.
- **후속 백로그**: 라벨 resolveByLabel N+1 bulk endpoint·#809(전표 품목 단가 기억)·#810(입금자명 거래처 매핑 기억).
- **범위 밖**: S1.5(세트 riUsage·약정DC)·S1d(구형 OLD 실 시트 sync).
