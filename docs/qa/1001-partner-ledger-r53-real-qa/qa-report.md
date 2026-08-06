# R53 라이브QA 보고서 — PR #1061 / 이슈 #1001 거래처별 원장

## 환경 확인

- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1001b`
- 브랜치/HEAD: 사용자 지정 기준 `feat/1001-ledger-spec-rest` / `84bb32ec9` (`git` 명령 금지 가드레일로 `git rev-parse HEAD`는 실행하지 않음)
- renderer: `node_modules/.bin/vite src/renderer --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5204 --strictPort`
- 포트 확인: 5199, 5200, 5202, 5203은 사용 중; 5204는 비어 있어 strictPort로 기동
- 실제 호출 오리진: `http://localhost:8080` (Playwright request 로그에서 확인)
- 주요 실제 호출: `GET /accounting/sales/aggregate?from=2026-01-01&to=2026-08-05`, `GET /accounting/journals/partner-ledger?partnerCode=...&from=2026-01-01&to=2026-08-05`
- 계정: `dev_accountant` 로그인 성공
- accounting-service 재배포 전: `Created=2026-08-04T14:14:35.791581819Z`, `StartedAt=2026-08-05T10:02:11.267280171Z`
- accounting-service 재배포 후: `Created=2026-08-05T11:35:22.04655355Z`, `StartedAt=2026-08-05T11:35:25.824979054Z`
- `accounting_db` Flyway 최고 성공 버전: `96`
- 실행 jar 근거: `shared/common` 실행 산출물 `common-0.1.0-SNAPSHOT.jar`의 `PartnerLedgerContract$Effect`에 `ADJUSTMENT` 심볼 존재를 `javap`로 확인. accounting-service bootJar는 해당 공통 jar를 포함해 재빌드됨.
- 드라이버 실행 원문: `cd clients/desktop; node r53-live-qa.mjs`
- 드라이버 모드: Playwright Chromium, mock OFF, 실제 로그인/API/화면 조작. 임시 드라이버는 커밋 대상 아님.

## 실행 결과

### 1. 집계 화면 — PASS

기간 `2026-01-01 ~ 2026-08-05`로 조회했고 실제 집계 38건이 렌더링됐다. 화면에 매출 합계·수금 합계·조정 합계·채권 잔액(기말)이 표시됐다.

증거: [집계 화면](screenshots/04-aggregate-2026-01-01--2026-08-05.png)

대표 행:

| 거래처 | 매출 | 수금 | 조정 | 기말 |
|---|---:|---:|---:|---:|
| (주)서울에어컨 | 19,800,000 | — | — | 19,800,000 |
| 대구HVAC솔루션 | 28,600,000 | 277,000 | — | 28,323,000 |
| 진주에어시스템 | — | 700,000 | — | -700,000 |

### 2. 상세 화면 및 라인 구분 — PASS

세 거래처를 실제로 행 클릭해 상세 원장을 열었다. 상세 라인에서 `매출`/`수금` 구분, 분개번호, 차변·대변·잔액이 표시됐다.

- 서울에어컨: 매출 19,800,000 1건
- 대구HVAC솔루션: 매출 28,600,000 1건 + 수금 120,000/80,000/77,000 3건
- 진주에어시스템: 수금 700,000 1건

증거: [대구 상세](screenshots/07-collection-detail.png), [진주 상세](screenshots/07-negative-collection-detail.png)

### 3. 인쇄 미리보기 — PASS

같은 세 거래처에서 [인쇄 미리보기]를 열었고 동일 기간과 거래처가 표시됐다. 인쇄 표의 구분과 합계·기말 금액이 상세와 같았다.

증거: [대구 인쇄](screenshots/08-collection-print.png), [진주 인쇄](screenshots/08-negative-collection-print.png)

### 4. 집계·상세·인쇄 세 경로 일치 — PASS

| 거래처 | 집계 | 상세 | 인쇄 | 판정 |
|---|---|---|---|---|
| 서울에어컨 | 매출 19,800,000 / 기말 19,800,000 | 동일 | 동일 | PASS |
| 대구HVAC솔루션 | 매출 28,600,000 / 수금 277,000 / 기말 28,323,000 | 동일 라인·합계 | 동일 라인·합계 | PASS |
| 진주에어시스템 | 수금 700,000 / 기말 -700,000 | 동일 라인·합계 | 동일 라인·합계 | PASS |

### 5. 산식 `기말 = 기초 + 매출 + 조정 − 수금` — PASS

화면의 기초 잔액은 세 거래처 모두 0원이었다.

- 서울에어컨: `0 + 19,800,000 + 0 − 0 = 19,800,000`
- 대구HVAC솔루션: `0 + 28,600,000 + 0 − 277,000 = 28,323,000`
- 진주에어시스템: `0 + 0 + 0 − 700,000 = -700,000`

세 건 모두 화면 숫자로 산식이 성립했다.

## 부수 관찰

- 로그인 후 `http://localhost:8080/auth/login`은 200이었다. `127.0.0.1:5204` 접근 시 localhost API 쿠키와 분리되어 로그인 후 세션이 유지되지 않았고, localhost renderer 접근으로 재실행해 정상화했다.
- 앱 부팅 중 대시보드/활동 로그/공지 관련 503·403 콘솔이 있었으나 거래처 원장 API와 화면 렌더링은 정상 수행됐다. 원장 기능 판정에는 영향 없음.
- 이번 실데이터의 조정 합계는 세 사례 모두 0(—)이었다. 이는 기대 특정 금액을 불변식으로 사용하지 않은 결과이며, 세 경로 일치와 산식은 PASS다.
- DB는 조회만 수행했다. 쓰기/변경 API는 호출하지 않았다.
- accounting-service 외 서비스는 재빌드·재배포·중지하지 않았다.

## 새 파일 목록

- `docs/qa/1001-partner-ledger-r53-real-qa/qa-report.md`
- `docs/qa/1001-partner-ledger-r53-real-qa/screenshots/*.png` — 실제 화면 캡처 12장
- `docs/qa/1001-partner-ledger-r53-real-qa/driver-calls.txt` — 실제 네트워크 호출 원문
- `docs/qa/1001-partner-ledger-r53-real-qa/observations.txt` — 세 거래처 화면 텍스트 관찰 기록

판정: **R53 라이브QA PASS**. 미실시 항목 없음. 머지 게이트 관점에서 남은 라이브QA 결함은 확인되지 않았다.
