# S25 라이브 QA 보고서 — PR #1045 · 이슈 #1039 가배차

## 배포 확인

- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- HEAD: `fce3e375a`
- 배포 대상: `slip-service`만
- `samhan-slip-service` 컨테이너: `Created 2026-08-05T13:14:36.091257079Z`, `StartedAt 2026-08-05T13:14:40.052180564Z`
- `slip_db` Flyway 최고 성공 버전: `V107`
- UI: `http://localhost:5180` (Vite, `--host localhost --port 5180 --strictPort`)
- API: `http://localhost:8080`, `VITE_API_BASE_URL=http://localhost:8080`
- Mock: OFF (`VITE_USE_MOCK=false`)
- 브라우저: 내장 브라우저 미사용. `clients/desktop` Playwright Chromium `.mjs` 드라이버를 `node`로 실행
- DB 직접 쓰기: 없음. 전표 생성 및 컷오프 변경은 실 화면·실 API 사용

## 최종 판정

| 항목 | 판정 | 캡처 |
|---|---|---|
| S22 부산 전표 `2026/08/05-7` 조회 및 부산 권역 분류 | **PASS** — `부산 해운대구 해운대해변로 300`이 `부산광역시`로 표시됨 | `mode-05-REGION_ONLY.png`, `mode-08-SANGIL_REGION_INCLUDED.png` |
| 반대급부 서울 전표 생성·권역 분류 | **PASS** — 신규 `2026/08/05-9` (`서울 중구 을지로 100`)가 `서울특별시`로 표시됨 | `02-create-counterpart-seoul.png`, `mode-05-REGION_ONLY.png` |
| 8모드 분리 결과 유지 | **PASS** — 8개 모드 모두 조회 완료, 교차 포함·차단 이상 없음 | `mode-01-*.png` ~ `mode-08-*.png` |
| 미분류 건수 회귀 여부 | **PASS** — S22의 기존 미분류 건수 패턴 유지. 분류되던 `-7`, 신규 `-9` 모두 미분류로 떨어지지 않음 | `mode-01`, `mode-02`, `mode-05`, `mode-06`, `mode-08` |
| 컷오프 원복 | **PASS** — REGION `12:00`, STACK `14:00` | `100-cutoff-restored-final.png` |

## 전표 및 권역 확인

| 전표 | 조건 | 실 화면 결과 | 판정 |
|---|---|---|---|
| `2026/08/05-7` | S22 생성 전표, 창고 `2`, REGION, 부산 해운대구 해운대해변로 300 | `부산광역시` | **PASS** |
| `2026/08/05-8` | S22 생성 전표, 창고 `00003`, STACK, 서울 중구 을지로 100 | `서울특별시` | **PASS** |
| `2026/08/05-9` | S25 반대급부, 창고 `2`, REGION, 서울 중구 을지로 100 | `서울특별시` | **PASS** |

S22에서 부산 전표가 `대구광역시`로 표시되던 결함은 S25에서 재현되지 않았습니다. `REGION_ONLY` 캡처 한 장에서 서울 `-9`와 부산 `-7`이 각각 `서울특별시`, `부산광역시` 그룹으로 동시에 확인됩니다.

## 8모드 재조회

| 모드 | 총 건수 | 미분류 | 핵심 확인 | 판정 | 캡처 |
|---|---:|---:|---|---|---|
| 1 `SANGIL_AND_CHOWOL_REGION_EXCLUDED` | 5 | 4 | REGION 대상 제외, STACK `-8` 노출 | **PASS** | `mode-01-SANGIL_AND_CHOWOL_REGION_EXCLUDED.png` |
| 2 `CHOWOL_REGION_EXCLUDED` | 3 | 2 | 초월/STACK `-8` 노출 | **PASS** | `mode-02-CHOWOL_REGION_EXCLUDED.png` |
| 3 `SANGIL_REGION_EXCLUDED` | 3 | 2 | 상일 REGION 대상 제외 | **PASS** | `mode-03-SANGIL_REGION_EXCLUDED.png` |
| 4 `STACK_ONLY` | 1 | 0 | `-8`만 노출 | **PASS** | `mode-04-STACK_ONLY.png` |
| 5 `REGION_ONLY` | 2 | 0 | 서울 `-9` + 부산 `-7`, 두 권역 정확 분류 | **PASS** | `mode-05-REGION_ONLY.png` |
| 6 `SANGIL_AND_CHOWOL_REGION_INCLUDED` | 7 | 4 | `-9`, `-8`, `-7` 포함 | **PASS** | `mode-06-SANGIL_AND_CHOWOL_REGION_INCLUDED.png` |
| 7 `CHOWOL_REGION_INCLUDED` | 3 | 2 | 초월/STACK `-8` 유지 | **PASS** | `mode-07-CHOWOL_REGION_INCLUDED.png` |
| 8 `SANGIL_REGION_INCLUDED` | 5 | 2 | 서울 `-9/-8`, 부산 `-7` 포함 | **PASS** | `mode-08-SANGIL_REGION_INCLUDED.png` |

S22 로그의 기존 미분류 패턴(모드 1/2/3/6/7/8 = `4/2/2/4/2/2`, 모드 4/5 = `0`)과 일치합니다. 주소가 있던 기존 분류 전표가 미분류로 회귀한 증거는 없습니다.

## 컷오프 변경 및 원복

| 배송태그 | 기준값 | 테스트값 | 최종값 | 판정 | 캡처 |
|---|---:|---:|---:|---|---|
| REGION(지방) | 12:00 | 23:59 | 12:00 | **PASS** | `98-cutoff-manual-restored.png`, `03-cutoff-expanded.png`, `100-cutoff-restored-final.png` |
| STACK(야적) | 14:00 | 23:59 | 14:00 | **PASS** | `98-cutoff-manual-restored.png`, `03-cutoff-expanded.png`, `100-cutoff-restored-final.png` |

## 새로 생성한 파일 목록

- `docs/qa/1039-provisional-dispatch-s25-real-qa/qa-report.md`
- `docs/qa/1039-provisional-dispatch-s25-real-qa/screenshots/` 아래 S25 캡처 15개
- `clients/desktop/s25-provisional-dispatch-real-qa.mjs`
- `clients/desktop/s25-provisional-dispatch-real-qa.log`
- `clients/desktop/vite-s25-real-qa.log`

생성한 신규 서울 전표 `2026/08/05-9`와 기존 QA 전표·창고는 삭제하지 않았습니다. 컷오프는 최종 확인 후 기준값으로 복원했습니다.
