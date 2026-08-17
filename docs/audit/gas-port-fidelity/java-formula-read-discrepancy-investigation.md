# 조사 브리프 — product-service Java GoogleSheetsClient FORMULA-read discrepancy (#30 PR-2 차단)

> 2026-06-10 작성. **Codex 회복(6/11 10:11) 후 집중 조사 대상**(개발책임자 옵션1 채택).
> 목표: estimate-app DB-mode 카탈로그(#30)의 상업멀티 useK2 parity 종결 → CATALOG_SOURCE 기본 db 전환.

## 증상

estimate-app 카탈로그를 우리 DB(product-service)로 치환(#455 머지)했으나, `ProductSheetSyncService` 가 시트 수식분기로 적재하는 변동DC 컬럼이 estimate-app(시트 직접 read) 대비 **결정적으로 과소 검출**:

| 항목 | JS 클라이언트(estimate-app, 정답) | Java sync(product-service) |
|---|---|---|
| 홈멀티 useK2($L$2) | **107** /122행 | 54 |
| 상업멀티 useK2($L$2) | **378** /417행 | 86 |
| 싱글 matKey($D$4·7·8) | (#451 D7 11 등) | 0~58 (run별) |

JS는 3회 반복 모두 동일(결정적 정확), Java도 결정적(86/54 고정).

## 핵심 사실 (실측 확인)

1. **동일 시트·동일 범위·동일 render option**: 둘 다 `<SHEET_ID>` 의 `상업멀티_단가인상!A1:Z`, `valueRenderOption=FORMULA`.
2. **JS 직접 read 3회 결정적**: 상업 F열(idx 6) `$L$2` = **378**, 홈 idx5 = **107** (googleapis Node 라이브러리).
3. **DISPLAY↔FORMULA 행 정렬 정상**: 양쪽 417행, 모델명(idx1) 행정합 불일치 **0건**. FORMULA render 에서 modelCode 셀이 수식인 행 **0**.
4. **`$L$2` 위치**: 전부 F열(idx 6), Z(25) 안쪽 — 범위폭 무관.

## 배제한 가설

- ❌ 범위 폭(A1:Z 26열 vs A1:ZZ 52열): `$L$2`는 F열, 무관. A1:Z 로 JS 테스트해도 378.
- ❌ Google API quota throttle: Java FORMULA read 가 매번 full rows(417/122/...) 반환, 부분응답 아님.
- ❌ `dateTimeRenderOption` 미설정(기본 SERIAL_NUMBER): 명시(`FORMATTED_STRING`) 추가해도 86/54 불변. **되돌림**.
- ❌ 행 인덱스 오정렬: DISPLAY/FORMULA 동일 행수·동일 순서 확인.
- ❌ modelCode 키 매핑 실패(modelCode 셀 수식): FORMULA render 에서 modelCode 수식 행 0.

## 남은 가설 (Codex 조사 출발점)

**Java `google-api-client` (Sheets v4 SDK) 의 FORMULA 렌더 응답 파싱이 일부 수식 셀을 계산값으로 받는다.** 동일 REST API인데 JS(googleapis)와 Java(google-api-client + GsonFactory) 결과가 다름 → 라이브러리/직렬화 레벨 이슈 추정:

1. **GsonFactory 대용량 mixed-type 배열 파싱**: 417×29 수식 문자열 응답에서 일부 셀이 number 로 파싱되는지. `GsonFactory.getDefaultInstance()` → `JacksonFactory` 교체 시 차이?
2. **`values.get` vs `batchGet`**: estimate-app readSheetGrid 와 동일하게 batchGet 또는 values+formulas 병렬+행 union 으로 읽으면 해소되는지(JS readSheetGrid 패턴 이식).
3. **요청 query param 실제 전송 검증**: `.setValueRenderOption("FORMULA")` 가 실제 `?valueRenderOption=FORMULA` 로 나가는지 wire log(HTTP transport 로깅) 캡처 — 만약 누락되면 기본 render(값) 반환되어 86=텍스트 `$L$2` 셀 수만 검출 설명됨.
4. **응답 크기/필드마스크**: 대용량 FORMULA 응답 절단 여부.

## 재현/검증 절차

```bash
# 1. 정답(JS) 재현 — 상업 378, 홈 107
cd clients/web/estimate-app
GOOGLE_SERVICE_ACCOUNT_KEY="C:\dev\samhan-homepage-a008794e8a4f.json" node -e "<diag2.js: FORMULA F열 $L$2 카운트 3회>"

# 2. Java sync 측정 — standalone-boot 후 단일 sync, DB 컬럼 카운트
DB_HOST=localhost ... GOOGLE_SERVICE_ACCOUNT_KEY=... SERVER_PORT=879x \
SPRING_AUTOCONFIGURE_EXCLUDE=...EurekaClientAutoConfiguration \
java -jar services/product-service/build/libs/product-service.jar
# 부팅 1회 sync 자동 실행 → docker exec samhan-postgres psql -U samhan -d product_db
#   "SELECT product_category, count(*) FILTER(WHERE has_variable_discount) FROM products GROUP BY 1"

# 3. 결정적 진단: GoogleSheetsClient.readSheetFormulas('상업멀티_단가인상!A1:Z') 의
#    [3][6] 셀이 String('=...') 인지 Number 인지 — 임시 IT 또는 디버그 로그로 확인
```

## 차단 영향 = 0 (운영)

- #455 가 `CATALOG_SOURCE=sheet` 기본(무회귀) 머지 — sheet 모드는 검증된 JS 클라이언트로 수식 정확 read.
- 상업 parity 갭은 **opt-in db 모드 한정** 발현, 아직 기본 아님.
- 해소 후 estimate-app `lib/code.js` bootstrap 의 `CATALOG_SOURCE` 기본값 'sheet'→'db' 전환 + 전 카탈로그 parity 실 QA.

## 동반 소규모 후속 (PR-2 묶음 후보)

- `priceInc.single = 0`: price-baseline(2000-01-01) 의 SINGLE_SET 매핑 0건 — `syncBeforeIncreasePriceHistory` 적재/카테고리 점검.
- `recommend homeEx`: OduRecommendationLookup home/homeEx 미분리 → 현재 home 동일 set graceful 반환. 엔티티 확장 시 분리.
