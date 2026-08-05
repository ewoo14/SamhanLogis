# R36 라이브 QA 보고서 — PR #1063 / 이슈 #1062

## 환경 확인

- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1062`
- 브랜치: `fix/1062-line-input-ux`
- 렌더러: `node_modules/.bin/vite src/renderer --config vite.renderer.dev.config.ts --host 127.0.0.1 --port 5204 --strictPort`
- 실제 브라우저 오리진: `http://localhost:5204`
- 네트워크로 확인한 실제 API 호출 오리진: `http://localhost:8080` (`VITE_API_BASE_URL`)
- mock: OFF
- 사용 계정: 분개 `dev_accountant / dev_p05_pass!`, 판매전표 `dev_manager / dev_p05_pass!`
- 컨테이너 상태: 모두 `running`
  - `samhan-api-gateway`: created `2026-08-04T22:34:18Z`, started `2026-08-05T10:02:11Z`
  - `samhan-accounting-service`: created `2026-08-04T14:14:35Z`, started `2026-08-05T10:02:11Z`
  - `samhan-slip-service`: created `2026-08-04T22:13:20Z`, started `2026-08-05T10:02:11Z`
  - `samhan-inventory-service`: created `2026-08-04T10:39:09Z`, started `2026-08-05T10:02:11Z`
  - `samhan-postgres`: created `2026-07-26T16:08:22Z`, started `2026-08-05T10:02:11Z`
- 드라이버 실행 원문: `cd clients/desktop; node qa-r36-driver.mjs`
- 드라이버 실행 결과 원문 핵심: `JOURNAL_AFTER_A_ROWS 3`, `JOURNAL_AFTER_B_DELETE_ROWS 3`, `JOURNAL_AFTER_B_CONTINUE_ROWS 4`, `JOURNAL_C_VALUES 1,500 1,500`, `POST /accounting/journals 201`, `GET /accounting/journals/{id} 200`, `POST /slips 201`, `SALES_DETAIL_REQUERY_URL http://localhost:5204/#/sales/{id}`

## 판정

| 동선 | 판정 | 확인 내용 | 캡처 |
|---|---|---|---|
| 분개 A 자동 빈행 | PASS | 초기 2행에서 trailing 행을 계정+금액으로 확정하자 3행으로 증가 | [02-분개-A-자동빈행추가-real-qa.png](02-분개-A-자동빈행추가-real-qa.png) |
| 분개 B trailing 빈행 삭제 후 계속 추가 | PASS | 빈행 삭제 후 3행이 유지됐고, 삭제 후 새 3번 행 입력 시 4행으로 증가. 삭제 뒤 빈행 1개 유지와 후속 입력 모두 확인 | [03-분개-B-빈행삭제후보장-real-qa.png](03-분개-B-빈행삭제후보장-real-qa.png), [04-분개-B-삭제후계속입력-real-qa.png](04-분개-B-삭제후계속입력-real-qa.png) |
| 분개 C 확정값 재포커스·지움·교체 | PASS | 1번 차변을 재포커스해 지운 뒤 `1,500`으로 교체하고 2번 대변도 `1,500`으로 맞춤 | [05-분개-C-확정값재포커스지움교체-real-qa.png](05-분개-C-확정값재포커스지움교체-real-qa.png) |
| 분개 F 저장 → 상세 재조회 | PASS | 저장 `201`, 상세 재조회 `200`. 상세 라인 2개(101 현금, 110 외상매출금), 차변 1,500/대변 1,500. 입력용 빈행은 저장되지 않음 | [06-분개-F-저장후상세재조회-real-qa.png](06-분개-F-저장후상세재조회-real-qa.png) |
| 판매전표 F 저장 → 상세 재조회 | PASS | `HQ-001 본사창고`, `6662700637 (B.E.S.T)에어컨`, `AJ040RXH4BC1` 선택 후 저장 `201`, 목록 재조회 후 상세 버튼 클릭 및 상세 URL/화면 확인. 상세에 거래처·사업자번호·품목이 표시됨 | [08-판매전표-F-헤더상품선택-real-qa.png](08-판매전표-F-헤더상품선택-real-qa.png), [09-판매전표-F-저장후상세재조회-real-qa.png](09-판매전표-F-저장후상세재조회-real-qa.png), [10-판매전표-F-상세실재조회-real-qa.png](10-판매전표-F-상세실재조회-real-qa.png) |

## 비고

- 분개 상세 화면은 2개 의미 라인만 표시했으며, trailing 빈행은 저장되지 않았다.
- 판매전표 상세 화면에는 거래처와 품목이 확인되었고, 출고 창고는 저장 전 실제 입력 화면에서 `HQ-001 본사창고`로 확인했다.
- `dev_accountant` 세션의 부팅 중 `GET /slips?...` 403은 대시보드 사전조회 권한 응답이며 분개 API 동선과 무관하다. 분개 저장/상세 API는 각각 201/200이었다.
- 새 파일: 이 보고서와 `01`~`10` 실 GUI PNG 캡처 11개. 캡처는 합성/fixture가 아닌 Node Playwright `page.screenshot()` 결과다.
- 임시 드라이버 `clients/desktop/qa-r36-driver.mjs`와 렌더러 실행 로그는 QA 종료 후 삭제 대상이며 커밋 대상이 아니다.
