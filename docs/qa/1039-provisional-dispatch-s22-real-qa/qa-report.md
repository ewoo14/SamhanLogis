# S22 라이브 QA 보고서 — PR #1045 · 이슈 #1039 가배차

## 환경 확인

- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- UI: `http://localhost:5179` (Vite 렌더러, `--host localhost --port 5179 --strictPort` 확인)
- API: `http://localhost:8080` (`/actuator/health` HTTP 200)
- API base: `VITE_API_BASE_URL=http://localhost:8080`
- Mock: OFF (`VITE_USE_MOCK=false`)
- 브라우저: 내장 도구가 아닌 `clients/desktop`의 `@playwright/test` Chromium `.mjs` 드라이버를 `node`로 실행
- 서비스 재빌드·재배포·중지: 없음
- DB 직접 UPDATE: 없음. 컷오프는 `hr.slip-cutoff` 관리자 화면으로만 변경
- QA 일시: 2026-08-05 (KST), 당일 출고일 기준

## 컷오프 변경 및 원복

| 배송태그 | 변경 전 | 테스트 중 | 원복 후 | 판정 | 캡처 |
|---|---:|---:|---:|---|---|
| REGION(지방) | 12:00 | 23:59 | 12:00 | PASS | `01-cutoff-before.png`, `02-cutoff-after.png`, `99-cutoff-restored.png` |
| STACK(야적) | 14:00 | 23:59 | 14:00 | PASS | `01-cutoff-before.png`, `02-cutoff-after.png`, `99-cutoff-restored.png` |

관리자 화면에서 변경 전 값을 먼저 기록했고, QA 종료 후 두 값을 원래대로 저장했습니다. 원복 후 화면에도 REGION 12:00, STACK 14:00이 표시됩니다.

## 전표 생성

| 전표 | 입력 조건 | 결과 | 판정 | 캡처 |
|---|---|---|---|---|
| A | 창고 코드 `2`(상일), `REGION`, 배송주소 `부산 해운대구 해운대해변로 300` | `2026/08/05-7` 생성·조회됨 | PASS | `create-REGION-2.png`, `mode-05-REGION_ONLY.png` |
| B | 창고 코드 `00003`(초월), `STACK`, 배송주소 `서울 중구 을지로 100` | `2026/08/05-8` 생성·조회됨 | PASS | `create-STACK-00003.png`, `mode-04-STACK_ONLY.png` |

## 8모드 대조표

| 모드 | 실측 결과 | 판정 | 캡처 |
|---|---|---|---|
| 1 `SANGIL_AND_CHOWOL_REGION_EXCLUDED` | 기존 결과 의미 유지. REGION 전표 A는 제외되고 STACK 전표 B는 노출됨 | PASS | `mode-01-SANGIL_AND_CHOWOL_REGION_EXCLUDED.png` |
| 2 `CHOWOL_REGION_EXCLUDED` | 기존 결과 의미 유지. 초월/STACK 전표 B는 노출되고 REGION 전표 A는 제외됨 | PASS | `mode-02-CHOWOL_REGION_EXCLUDED.png` |
| 3 `SANGIL_REGION_EXCLUDED` | 기존 결과 의미 유지. 초월/STACK 전표 B는 노출되고 상일/REGION 전표 A는 제외됨 | PASS | `mode-03-SANGIL_REGION_EXCLUDED.png` |
| 4 `STACK_ONLY` | 전표 B `2026/08/05-8`만 노출, 전표 A `2026/08/05-7` 미노출 | PASS | `mode-04-STACK_ONLY.png` |
| 5 `REGION_ONLY` | 전표 A `2026/08/05-7`만 노출, 전표 B `2026/08/05-8` 미노출 | PASS | `mode-05-REGION_ONLY.png` |
| 6 `SANGIL_AND_CHOWOL_REGION_INCLUDED` | 기존 결과 의미 유지. REGION/STACK 전표가 각각 포함됨 | PASS | `mode-06-SANGIL_AND_CHOWOL_REGION_INCLUDED.png` |
| 7 `CHOWOL_REGION_INCLUDED` | 기존 결과 의미 유지. 초월/STACK 전표 B 포함, 상일/REGION 전표 A 제외 | PASS | `mode-07-CHOWOL_REGION_INCLUDED.png` |
| 8 `SANGIL_REGION_INCLUDED` | 기존 결과 의미 유지. 상일/REGION 전표 A와 초월/STACK 전표 B 모두 포함 | PASS | `mode-08-SANGIL_REGION_INCLUDED.png` |

※ S21과 총 건수는 이번 라운드에서 전표 A/B를 새로 생성했으므로 달라질 수 있어, “컷오프 변경으로 다른 모드가 차단되거나 교차 포함되지 않았는지”의 의미·분리 조건으로 대조했습니다.

## 권역 버킷 판정

| 전표 | 배송주소 | 화면 버킷 | 판정 | 캡처 |
|---|---|---|---|---|
| A | 부산 해운대구 해운대해변로 300 | `대구광역시` | **FAIL** — 미분류는 아니지만 부산 주소가 대구광역시로 잘못 분류됨 | `mode-05-REGION_ONLY.png` |
| B | 서울 중구 을지로 100 | `서울특별시` | PASS | `mode-04-STACK_ONLY.png` |

### FAIL 재현 절차

1. `dev_manager`로 로그인합니다.
2. 출고 창고 코드 `2`, 배송태그 `REGION`, 배송주소 `부산 해운대구 해운대해변로 300`으로 전표를 생성합니다.
3. `dev_dispatch`로 가배차 분류 화면에서 `REGION_ONLY`를 조회합니다.
4. 전표 `2026/08/05-7`의 주소는 부산인데 권역 헤더가 `대구광역시`로 표시됩니다.

기대값은 부산 주소에 대응하는 부산 권역이며, 현재 결과는 “미분류 아님” 조건만 만족하고 실제 권역 정확성은 만족하지 않습니다. 이 결함 때문에 S22 전체 QA 판정은 **조건부 FAIL**입니다.

## 산출물 및 변경 파일

- [qa-report.md](qa-report.md)
- [01-cutoff-before.png](screenshots/01-cutoff-before.png)
- [02-cutoff-after.png](screenshots/02-cutoff-after.png)
- [03-preclassify-initial.png](screenshots/03-preclassify-initial.png)
- [create-REGION-2.png](screenshots/create-REGION-2.png)
- [create-STACK-00003.png](screenshots/create-STACK-00003.png)
- `mode-01` ~ `mode-08` 캡처 8개
- [99-cutoff-restored.png](screenshots/99-cutoff-restored.png)
- 신규 실행 드라이버: [s22-provisional-dispatch-real-qa.mjs](../../../clients/desktop/s22-provisional-dispatch-real-qa.mjs)
- 실행 로그: `clients/desktop/s22-provisional-dispatch-real-qa.log`

사용자가 지시한 대로 생성한 창고·전표는 삭제하지 않았고, 컷오프만 원래 값으로 복원했습니다.
