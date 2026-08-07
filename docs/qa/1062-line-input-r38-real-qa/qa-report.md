# R38 라이브 QA 보고서 — PR #1063 · 이슈 #1062

## 환경 확인

- 렌더러 포트: `5204` (실측 `http://localhost:5204/` 응답 200)
- 렌더러 실행 옵션: `--host localhost --port 5204 --strictPort`
- mock: OFF (`VITE_USE_MOCK=false`)
- API base URL: `VITE_API_BASE_URL=http://localhost:8080`
- 실제 호출 오리진: `http://localhost:8080` (로그인 `POST /auth/login` 200, 거래처 검색 `GET /admin/partners/search?...` 200, 품목 조회 `GET /slips/lookup-product?...` 200)
- 계정: `dev_manager / ${QA_DEV_DEFAULT_PASSWORD}`
- 컨테이너 상태: 서비스 재빌드·재배포·중지 없이 기존 컨테이너를 사용함. `created=/started=` (Docker inspect UTC):
  - `samhan-api-gateway created=2026-08-04T22:34:18.879154069Z started=2026-08-05T10:02:11.280446347Z`
  - `samhan-auth-service created=2026-08-03T14:34:20.226032107Z started=2026-08-05T10:02:11.261460747Z`
  - `samhan-partner-service created=2026-07-23T13:40:46.849980189Z started=2026-08-05T10:02:11.264451964Z`
  - `samhan-slip-service created=2026-08-04T22:13:20.425967767Z started=2026-08-05T10:02:11.295189071Z`
  - `samhan-product-service created=2026-08-05T10:17:39.747773714Z started=2026-08-05T10:17:43.342187543Z`
  - `samhan-accounting-service created=2026-08-05T11:35:22.04655355Z started=2026-08-05T11:35:25.824979054Z`
- 드라이버 실행 원문: `node qa-r38-driver.mjs` (작업 디렉토리 `clients/desktop`)
- 렌더러 실행 원문: `node_modules/.bin/vite src/renderer --config vite.renderer.dev.config.ts --host localhost --port 5204 --strictPort`

## 대상 및 절차

대상은 기존 견적 수정 화면이 아닌 신규 작성 화면 `/sales/estimates/new`이다.

1. 거래처 `6662700637 (B.E.S.T)에어컨`을 선택했다.
2. 라인 1에 `AJ040RXH4BC1`을 입력하고 다른 영역으로 이동해 확정했다.
3. 생성된 trailing 빈행(라인 2)을 삭제했다.
4. 삭제 후 남은 다음 빈행(라인 2)에 같은 품목을 입력·확정했다.

## 결과

- 행 수: **확정 후 2 → 삭제 후 2 → 재입력·확정 후 3**
- 삭제 후에도 빈행 1개가 재보장되었고, 다음 라인 입력·확정으로 행 수가 증가했다.
- 판정: **PASS**

## 캡처

- [01-new-estimate.png](./01-new-estimate.png) — 신규 작성 화면
- [02-after-confirm-trailing-blank.png](./02-after-confirm-trailing-blank.png) — 라인 1 확정 후 trailing 빈행 포함, 행 수 2
- [03-after-delete.png](./03-after-delete.png) — trailing 빈행 삭제 후에도 빈행 재보장, 행 수 2
- [04-after-reinput.png](./04-after-reinput.png) — 다음 라인 재입력·확정 후 행 수 3

## 새 파일 목록

- `docs/qa/1062-line-input-r38-real-qa/qa-report.md`
- `docs/qa/1062-line-input-r38-real-qa/01-new-estimate.png`
- `docs/qa/1062-line-input-r38-real-qa/02-after-confirm-trailing-blank.png`
- `docs/qa/1062-line-input-r38-real-qa/03-after-delete.png`
- `docs/qa/1062-line-input-r38-real-qa/04-after-reinput.png`
