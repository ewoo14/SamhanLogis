# R35 라이브 QA 보고서

- 대상: PR #1063 · 이슈 #1062
- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- 브랜치: `fix/1062-line-input-ux`
- 수행일: 2026-08-05 (KST)

## 환경 확인

| 항목 | 결과 |
|---|---|
| Playwright | `node_modules\\.bin\\playwright.cmd --version` → `Version 1.59.1` |
| Chromium | `node_modules\\.bin\\playwright.cmd install chromium` 실행 완료(출력 없이 즉시 종료) |
| 렌더러 | `VITE_API_BASE_URL=http://localhost:8080`, `vite ... --host 127.0.0.1 --port 5203 --strictPort` 기동 확인 |
| 실제 호출 오리진 | 브라우저 미확보로 실제 호출 미실시; 설정값은 `http://localhost:8080` |
| 컨테이너 | `docker ps` 기준 18개 컨테이너가 `Up`/healthy 상태. `samhan-api-gateway` created `2026-08-05 07:34:18 +0900`, started 상태 `Up About an hour`; 개별 서비스도 모두 started 상태 |
| 사용 계정 | 브라우저 미확보로 로그인 미실시 |

## 브라우저 확보 결과

브라우저 제어 런타임 연결이 `No browser is available`로 실패했습니다. 문제 해결 절차에 따라 가용 브라우저 목록을 확인했으나 `[]`였습니다. 사용자가 지정한 가드레일(브라우저가 안 되면 즉시 중단)에 따라 이 시점에서 QA를 중단했습니다.

## 동선 판정

| 화면/동선 | 판정 | 캡처 파일명 | 비고 |
|---|---|---|---|
| 분개 A 자동 빈행 | 미실시 | 없음 | 브라우저 미확보 |
| 분개 B trailing 빈행 삭제 후 계속 추가 | 미실시 | 없음 | 브라우저 미확보 |
| 분개 C 확정 값 재포커스·지움·교체 | 미실시 | 없음 | 브라우저 미확보 |
| 분개 F 저장 → 상세 재조회 | 미실시 | 없음 | 브라우저 미확보 |
| 판매전표 F 저장 → 상세 재조회 | 미실시 | 없음 | 브라우저 미확보 |

실제 GUI 캡처를 한 장도 생성하지 않았으므로 PASS로 판정한 항목은 없습니다.

## 신규 파일

- `docs/qa/1062-line-input-r35-real-qa/qa-report.md`
