# PR #1047 / Issue #1012 R6 — 레거시 입출고 내역·분석 완전계승 구현

## 1. 판정 범위와 데이터 출처

- 작업 브랜치: `feat/1012-inout-analysis`
- 구현 범위: 입출고 응답의 모델-연-월 차원 보존 + 레거시 분석 5개 표면 구현.
- 원본 XLSX 확인: `docs/migration/ecount-data/raw/`에는 `.gitkeep`만 있고
  `품목-Excel다운로드-20260802.xlsx` 등 실 원본 파일이 없다. 따라서 레거시 원본과 DB 값의
  동일성은 **원본 부재로 미판정**이다.
- DB 측정은 공유 PostgreSQL에 `SET default_transaction_read_only=on`을 지정한 SELECT만 실행했다.
  현재 컨테이너/로컬 계정 문맥에는 `[DEV-SEED] 개발마스터`가 존재하므로 아래 수치는 실운영
  데이터가 아니라 **로컬 개발 시드 측정값**이다.
- 직접 측정값: 확정 전표 라인 82, 모델 61, 모델-월 점 79, 월 4개.
  SQL의 월 점은 `COUNT(DISTINCT (date_trunc('month', slip_date), model_name))`이다.

## 2. 레거시 원문과 현행 대조

| 항목 | 레거시 원문(파일:줄) | 기존 현행 | R6 구현/값 대조 |
|---|---|---|---|
| 월 키 | `tools/legacy-gas/입출고 내역/code.js:63`의 `YYYYMM` 키 생성 | 모델 총합만 반환, 월 필드 없음 | BE `InOutAnalysisResponse.MonthlyPoint`에 `year/month`를 추가하고 `InOutAnalysisService.java:58`에서 전표일 기준 누적 |
| 월 입고·출고 값 | `code.js:65-70`의 `input[keyDate]`, `output[keyDate]` 누적 | 응답/화면 표현 0점 | 모델별 `monthly[]`의 입고·출고 수량으로 표현. 시드 측정 79/79점 |
| 전년·당년 출고 추이 | `tools/legacy-gas/입출고 분석/Index.html:345-353`의 12개월 배열과 2025/2026 분기 | 항목 자체 없음 | `deriveLegacyAnalysis()`가 전년/당년 월량을 12개월 산출하고 페이지 표에서 12개월 표시 |
| 수요예측 | `Index.html:368-381`: 당년 출고가 있는 마지막 월, 동월 전년/당년 합계 비율, 이후 월에 `전년 월량 × rate`를 반올림 | 항목 자체 없음 | 동일 규칙을 `inoutAnalysisModel.ts:103-117`에 순수 함수로 구현하고 예측 건수를 배지로 표시 |
| Top 3 | `Index.html:388-392`: 모델별 출고량 내림차순 후 `slice(0, 3)` | 항목 자체 없음 | 실제 응답 행의 출고량으로 최대 3건 산출/표시 |
| Bottom 3 | `Index.html:388-393`: 같은 정렬 후 `slice(-3).reverse()` | 항목 자체 없음 | 동일 순서 규칙으로 최대 3건 산출/표시 |
| 추천·알림 | `Index.html:395-403`: Top 1의 `input-output <= 0` 발주 권장/주력 상품, `rate > 1.1` 수요 상승, 없으면 특이사항 없음 | 항목 자체 없음 | 동일 조건을 `deriveLegacyAnalysis()`에서 실 월 행으로 계산하고 산출 건수 표시 |

### 판단이 갈린 지점

1. 월 정보를 별도 top-level 응답으로 만들지 않고 기존 모델 집계 행의 additive `monthly[]`로 넣었다.
   기존 `82라인 → 61행`과 칩 필터 계약을 깨지 않으면서 월 점을 보존하기 위한 선택이다.
   대안인 모델-월별 행 평탄화는 기존 행 수/칩 count를 바꾸므로 폐기했다.
2. 수요예측의 연도는 GAS의 고정 2025/2026 대신 응답 월 점의 최댓값을 당년으로 정하고 직전 연도를
   전년으로 삼았다. API 기간이 바뀌어도 규칙이 유효하고, 고정 연도 하드코딩을 피하기 위한 선택이다.
   대안인 고정 연도는 2027년 이후 화면에서 전년/당년이 잘못 묶이므로 폐기했다.
3. 추이 표는 GAS와 같이 12개월 슬롯을 모두 표시하고, 각 데이터 항목의 산출 건수는 실제 계산 배열
   길이로 표시했다. 원본 XLSX가 없으므로 “실운영 원본의 행 수”라고 단정하지 않았다.

## 3. 구현 내용

- BE 응답에 `monthly: [{year, month, inboundQuantity, outboundQuantity}]` 추가.
- 확정 입고/출고 전표 라인을 모델별로 합산하면서 전표 `slipDate`의 `YearMonth`를 함께 누적하고 정렬된 배열로 반환.
- FE API 타입과 변환기를 월 계약에 맞춤.
- `deriveLegacyAnalysis()` 추가: 추이, 예측, Top 3, Bottom 3, 추천·알림을 모두 실제 API 행의 월 점에서 계산.
- 화면을 `@samhan/design-system`의 `Card`/`Badge`로 구성.
- 화면에 월 점수, 추이 12개월, 예측 건수, Top 3 건수, Bottom 3 건수, 추천·알림 건수를 표시.
- 레거시 HTML/CSS/Chart.js를 이식하지 않았다.

## 4. 불변식 1~5 실측

| 불변식 | 실측/판정 |
|---|---|
| 1. 월 차원 | 로컬 개발 시드 직접 SELECT: 79 모델-월점/4개월. 신규 응답은 `monthly[]`로 79점 표현 경로를 갖는다. 원본 XLSX는 부재라 실운영 원본 판정은 미판정. 화면 count는 조회 필터 결과를 기준으로 계산한다. |
| 2. 분석 항목 | 전년·당년 추이 12개월 슬롯, 수요예측 0~12건, Top 3 최대 3건, Bottom 3 최대 3건, 추천·알림 최소 1건을 실제 응답 행에서 산출하도록 구현했다. live 서버가 이전 이미지라 이번 세션에 UI 실 API 캡처는 하지 않았다. |
| 3. 원문 근거 | 위 표의 각 계산 규칙에 GAS `Index.html` 파일:줄을 명시했고, 새 함수 테스트가 월 합계/예측/순위/추천을 검증한다. 추측 규칙을 추가하지 않았다. |
| 4. 회귀 | 기존 대상 7개 테스트는 유지되고 신규 3개를 합쳐 대상 파일 10/10 통과. 기존 82→61 집계/칩 함수는 변경하지 않았고, 분류 근거가 없는 행의 `미분류` 단일 칩 규칙도 그대로다. |
| 5. 차단 | 권한/API 경로/공유 DB 쓰기/DDL/Docker 이미지 재빌드를 하지 않았다. FE typecheck와 BE compileJava가 통과했다. |

### Linux 단정 점검

- FE는 TypeScript 순수 함수와 React 코드이며 Windows 전용 API를 사용하지 않는다.
- BE는 `java.time.YearMonth`, `TreeMap`, record 등 표준 Java/Spring 코드만 사용한다.
- 경로/줄바꿈/PowerShell 명령을 제품 코드에 넣지 않았다. Ubuntu CI에서 `compileJava`, TypeScript
  typecheck, Vitest가 동일하게 실행될 수 있는 형태다.
- 다만 실제 Ubuntu CI 실행 결과 자체는 이 세션에서 확보하지 않았으므로 CI green으로 단정하지 않는다.

## 5. 테스트 결과

- RED: 신규 3개 테스트가 구현 전 `deriveLegacyAnalysis is not a function`으로 실패, 기존 7개는 통과.
- GREEN: `npm run test -- src/renderer/routes/warehouse/inoutAnalysisModel.test.ts --run` → 10/10 통과.
- 필수 typecheck: `clients/desktop npm run typecheck` → 통과.
- 전체 Vitest: `clients/desktop npm run test -- --run` → **192 files / 1732 tests 통과**(출력상 기존 경고만 존재).
- BE 컴파일: `./gradlew :services:slip-service:compileJava --no-daemon --console=plain` → BUILD SUCCESSFUL.
- BE 전체 테스트: `./gradlew :services:slip-service:test --no-daemon` → 304초 무출력 timeout.
  따라서 BE 전체 테스트 성공으로 보고하지 않는다. Docker 이미지 재빌드와 공유 DB write/DDL은 하지 않았다.
- 빌드: `clients/desktop npm run build` → 통과. 파생물 신선도 가드 해소 목적이었다.

## 6. 파일별 변경량

`git diff --numstat` 기준(추가/삭제 분리):

| 파일 | +N | −M |
|---|---:|---:|
| `clients/desktop/src/renderer/api/inventory.ts` | +8 | −0 |
| `clients/desktop/src/renderer/routes/warehouse/InOutAnalysisPage.tsx` | +37 | −2 |
| `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.test.ts` | +62 | −1 |
| `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts` | +108 | −0 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/service/InOutAnalysisService.java` | +21 | −1 |
| `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/InOutAnalysisResponse.java` | +6 | −1 |
| **코드 합계** | **+242** | **−5** |

## 7. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1012-r6-legacy-parity-impl.md` (본 보고서)

커밋, push, checkout, 브랜치 조작은 수행하지 않았다.
