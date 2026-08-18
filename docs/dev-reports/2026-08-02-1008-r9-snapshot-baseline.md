# PR #1058 / Issue #1008 R9 — 원본 스냅샷 기준선 보고서

작성일: 2026-08-02 (KST)  
작업 브랜치/HEAD: `feat/1008-daily-closing` / `cf08f6eae`  
범위: 원본 고정, 기준선 측정, 스냅샷 회귀 테스트

## 1. 스냅샷

- 저장 경로: `docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv`
- 메타데이터: `docs/dev-reports/1008-r9-snapshot/metadata.json`
- 출처: Spreadsheet ID `<SHEET_ID>`, 시트 `싱글 구성품`, range `A1:N1737`
- 취득 시각: `2026-08-02 22:40:29 +09:00`
- 형식: GViz `text/csv; charset=utf-8` 응답 원문. 값·행·열 가공 없음.
- 크기/행: 290,247 bytes, 헤더 1행 + data 1,735행, 14열
- SHA-256: `405b2596d61a2a4f3658bc9ed4f75d0b3ba9dfcf7a643e9ce38bbbc88ed0e663`

## 2. 실외기 기준선 및 R8 후 수치

스냅샷 전체를 CSV 파서로 읽어 실내기 271행, 실외기 271행을 확인했다. 각 실외기 행의 `(setModel, componentModel)`을 현재 `product_db`의 `SINGLE_SET` active `bundle_component` 링크(읽기 전용 조회)와 대조한 결과는 다음과 같다.

| 측정 | 실외기 불일치 | 비고 |
|---|---:|---|
| 스냅샷 기준선 | 0 | 271개 행 모두 active 구성 링크 존재 |
| R8 규칙 교정 후 | 0 | 동일 스냅샷 계약 테스트 및 targeted test GREEN |

R7의 모집단 `실내기 97 + 실외기 97`, 불일치 63은 이번 스냅샷의 전체 원본 모집단(271+271)과 다르다. 따라서 63을 이번 스냅샷에 억지로 투영하지 않았다. 이번 라운드에서 확인 가능한 권위 기준선은 **0 → 0**이며, R7의 63 → 0을 동일 모집단의 전수 재현으로 주장하지 않는다.

## 3. 불변식 실측

1. **스냅샷 고정**: CSV, 출처·시각·행 수·SHA-256을 저장했고 `metadata.json`에 기록했다.
2. **실외기 불일치 0**: 스냅샷 271개 실외기 링크 대조 결과 기준선 0, R8 후 0.
3. **과차감 0 / 0원**: R8 targeted regression에서 과차감 경로가 새로 생성되지 않았고, 기존 R5/R6 benchmark `994행 / 42,200,000원` 제거 상태를 유지한다.
4. **실내기 불일치 0 / 옵션 미보유 164곳 0원 변화**: 스냅샷의 실내기 271행 및 R8의 옵션 미보유 처리(6개 DC 전부 null이면 기존 금액 유지)와 기존 164곳/0원 benchmark를 유지한다.
5. **fallback / 조회 비용**: `dailyDetailKeepsModelTokenFallbackWhenSetMatchFails` targeted test PASS. `estimateComponents("SINGLE_SET")`와 `estimateComponents("COMMERCIAL_MULTI")` 두 bulk 호출 구조로 N+2 이내 계약을 유지한다.

## 4. 테스트

- 스냅샷 회귀 테스트: `:services:accounting-service:test --tests '*DailyClosingSnapshotBaselineTest'` — **BUILD SUCCESSFUL**, 1 test, 19초.
- RED 확인: 최초 실행은 모듈 실행 디렉터리에서 스냅샷을 찾지 못해 `NoSuchFileException`으로 실패했고, 루트/모듈 양쪽 경로를 지원하도록 보완한 뒤 GREEN 확인.
- `accounting-service` 전체 테스트: `:services:accounting-service:test --no-daemon --console=plain` — **338초 후 timeout, exit code 124**. 성공으로 간주하지 않으며 CI를 권위 기준으로 둔다.
- Docker 이미지 재빌드·공유 DB write/DDL·commit/push는 수행하지 않았다.

## 5. 새 파일 및 파일별 변경량

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv` | +1,736 | -0 |
| `docs/dev-reports/1008-r9-snapshot/metadata.json` | +19 | -0 |
| `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingSnapshotBaselineTest.java` | +99 | -0 |
| `docs/dev-reports/2026-08-02-1008-r9-snapshot-baseline.md` | +52 | -0 |

새로 만든 파일은 위 4개이며, 특히 untracked 스냅샷 경로를 포함한다.
