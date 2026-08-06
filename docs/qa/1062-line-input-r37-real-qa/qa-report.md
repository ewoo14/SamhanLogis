# R37 실 QA 보고서 — PR #1063 / 이슈 #1062

## 환경 확인

- 작업 브랜치: `fix/1062-line-input-ux`
- 렌더러: `clients/desktop/node_modules/.bin/vite src/renderer --config vite.renderer.dev.config.ts --host 127.0.0.1 --port <포트> --strictPort`
- 포트 확인: `5199`, `5200`, `5202`, `5203` 사용 중. `5204` 미사용. 이번 QA 브라우저 접속 오리진은 `http://localhost:5200`.
- 실제 API 호출 오리진: `http://localhost:8080`.
- Mock: OFF (`VITE_MOCK_MODE` 미설정), API base는 `http://localhost:8080`.
- 계정: `dev_manager / dev_p05_pass!` — UI 로그인 `POST /auth/login` 200 확인.
- 부수 호출: `/app/version` 및 `/app/notices/active`는 503이었으나 로그인·재고이동·견적 대상 API는 정상 응답하여 대상 QA를 계속했다.
- 컨테이너: 재빌드·재배포·중지하지 않음. `docker ps` 기준 모두 `Up`/healthy.

| 컨테이너 | Created | 상태 / Started 관찰 |
|---|---|---|
| `samhan-api-gateway` | 2026-08-05 07:34:18 +0900 | Up 2 hours (healthy) |
| `samhan-auth-service` | 2026-08-03 23:34:20 +0900 | Up 2 hours (healthy) |
| `samhan-inventory-service` | 2026-08-04 19:39:09 +0900 | Up 2 hours (healthy) |
| `samhan-slip-service` | 2026-08-05 07:13:20 +0900 | Up 2 hours (healthy) |
| `samhan-product-service` | 2026-08-05 19:17:39 +0900 | Up About an hour (healthy) |
| `samhan-postgres` | 2026-07-27 01:08:22 +0900 | Up 2 hours (healthy) |

전체 `docker ps` 대상 서비스가 실행 중이며, 별도 중지/재기동은 하지 않았다.

### 드라이버 실행 원문

```text
node clients/desktop/r37-real-qa.mjs
node clients/desktop/r37b.mjs
node clients/desktop/r37c.mjs
node clients/desktop/r37d.mjs
node clients/desktop/r37e.mjs
```

모든 캡처는 저장소 루트 `docs/qa/1062-line-input-r37-real-qa/`에 저장했다. 위 임시 드라이버는 QA 종료 후 삭제했다.

## 판정 요약

| 동선 | 판정 | 근거 |
|---|---|---|
| ① 재고이동 A/B/C/F | PASS | 자동 빈행, trailing 빈행 삭제 후 재입력 행 증가, 재포커스·지움·교체, 저장 후 상세 1개 라인 재조회 확인 |
| ② 견적 B 재판정 | 미실시(공동편집 잠금 차단) | trailing 빈행은 1개 존재했으나 `라인 3 삭제` 버튼이 disabled여서 삭제 후 계속 입력 기준을 실행할 수 없음. PASS로 세지 않음. |
| ③ 견적 E 버전 복원 | PASS | 수정·저장 PUT 200, 2개 이상 버전 이력, 복원 UI/POST 200, 복원 후 2개 라인과 수량 확인 |

## ① 재고이동 — PASS

실제 데이터로 `HQ-001 본사창고 → CS-001 거래처 위탁창고`, 품목 `AJ040RXH4BC1`, 수량 1, 사유 재배치를 입력했다.

- A 자동 빈행: 첫 확정 입력 중 `.line-row-transfer`가 1행에서 2행으로 증가했다. 캡처: [04-transfer-A-auto-blank-row.png](04-transfer-A-auto-blank-row.png)
- B trailing 빈행 삭제 후 계속 추가: trailing 행 삭제 후 1행, 동일 품목 재입력·확정 후 2행으로 다시 증가했다. 판정 기준은 빈행이 사라졌는지가 아니라 “삭제 후에도 계속 입력·확정되고 행 수가 증가하는가”이며 PASS다. 캡처: [05-transfer-B-delete-then-continue.png](05-transfer-B-delete-then-continue.png)
- C 확정 품목 재포커스·지움·교체: `AJ040RXH4BC1`을 재포커스하여 지우고 다시 입력·확정했다. 확정 품목명 `실외기_4HP 다배관`과 요청 수량 1을 확인했다. 캡처: [06-transfer-C-refocus-clear-replace.png](06-transfer-C-refocus-clear-replace.png)
- F 저장: `POST /inventory/transfers` 201, 이동번호 `2026/08/05-3` 생성. 목록에 표시됐다. 캡처: [07-transfer-F-list-after-save.png](07-transfer-F-list-after-save.png)
- 저장 후 상세 재조회: `2026/08/05-3` 상세에서 출발 `HQ-001`, 도착 `CS-001`, 요청 수량 `1`, 출고 `0`, 입고 `0` 확인. 표의 데이터 라인 수는 1개이며 빈행은 저장되지 않았다. 캡처: [08-transfer-F-detail-reread-latest.png](08-transfer-F-detail-reread-latest.png)

이번 라운드에서 생성된 문서: `2026/08/05-2`, `2026/08/05-3` (삭제하지 않음). `2026/08/05-3`을 최종 상세 확인 대상으로 사용했다.

## ② 견적 B 재판정 — 미실시(공동편집 잠금 차단)

견적 `2026/08/05-1`에 실제 진입하여 편집 화면의 모델 행을 확인했다. 모델 행은 3개였고, 3번째 행은 trailing 빈행이었다. 그러나 공동편집이 활성화된 편집 화면에서 `라인 3 삭제` 버튼이 disabled였다.

따라서 지시된 “trailing 빈행을 지운 뒤에도 다음 라인을 계속 입력·확정하여 행 수가 증가하는가” 동선을 실제로 끝까지 수행할 수 없었다. 빈행이 존재한다는 사실만으로 PASS 처리하지 않는다.

캡처: [14-quote-B-blocked-by-coedit.png](14-quote-B-blocked-by-coedit.png)

## ③ 견적 E 버전 복원 — PASS

대상 견적 `2026/08/05-1`, 거래처 `6662700637 (B.E.S.T)에어컨`에 실제 편집 진입했다.

1. 비고를 `R37 version save check`로 수정하고 `임시저장` 실행.
2. `PUT /slips/estimates/1b1a8f69-9dda-4d2b-9e73-1572da4005ac` 200 확인. 응답 버전은 6.
3. 버전 이력에서 복원 버튼이 노출됨을 확인하고 버전 1 복원 선택.
4. 복원 확인 모달에서 복원 실행.
5. `POST /api/v1/slips/estimates/1b1a8f69-9dda-4d2b-9e73-1572da4005ac/revisions/1/restore` 200 확인. 복원 응답 버전은 7.
6. 복원 후 비고가 빈 값으로 돌아왔고, 라인 2개가 모두 `AJ040RXH4BC1 / 실외기_4HP 다배관`, 수량 `1 / 1`로 표시됐다. 총액도 공급가액 2,700,000 / 부가세 270,000 / 총합 2,970,000으로 온전하게 표시됐다.

캡처: [09-quote-detail-initial.png](09-quote-detail-initial.png), [10-quote-edit-before-save.png](10-quote-edit-before-save.png), [11-quote-after-second-save.png](11-quote-after-second-save.png), [12-quote-after-restore.png](12-quote-after-restore.png)

## 새 파일 목록

- `docs/qa/1062-line-input-r37-real-qa/qa-report.md`
- `docs/qa/1062-line-input-r37-real-qa/00-login.png`
- `docs/qa/1062-line-input-r37-real-qa/01-after-login.png`
- `docs/qa/1062-line-input-r37-real-qa/02-transfer-new.png`
- `docs/qa/1062-line-input-r37-real-qa/03-transfer-source-selected.png`
- `docs/qa/1062-line-input-r37-real-qa/03-transfer-warehouses-selected.png`
- `docs/qa/1062-line-input-r37-real-qa/04-transfer-A-auto-blank-row.png`
- `docs/qa/1062-line-input-r37-real-qa/04-transfer-warehouses-selected.png`
- `docs/qa/1062-line-input-r37-real-qa/05-transfer-B-delete-then-continue.png`
- `docs/qa/1062-line-input-r37-real-qa/06-transfer-C-refocus-clear-replace.png`
- `docs/qa/1062-line-input-r37-real-qa/07-transfer-F-list-after-save.png`
- `docs/qa/1062-line-input-r37-real-qa/08-transfer-F-detail-reread-latest.png`
- `docs/qa/1062-line-input-r37-real-qa/08-transfer-F-detail-reread.png`
- `docs/qa/1062-line-input-r37-real-qa/09-quote-detail-initial.png`
- `docs/qa/1062-line-input-r37-real-qa/10-quote-edit-before-save.png`
- `docs/qa/1062-line-input-r37-real-qa/11-quote-after-second-save.png`
- `docs/qa/1062-line-input-r37-real-qa/12-quote-after-restore.png`
- `docs/qa/1062-line-input-r37-real-qa/14-quote-B-blocked-by-coedit.png`
