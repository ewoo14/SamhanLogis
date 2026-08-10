# PR #1154 R25 SOL 5.6 — 적대검증 재수렴 · 머지 직전 관문

## 판정

**실 사용자 경로로 재현 가능한 결함은 0건이다.**

R24의 `CSV_ENCODING%` 정규화는 적재 결과 응답, 페이지 조회 응답, 실제 보류 패널에서 같은 값인 `읽을 수 없음`으로 도달했다. `INPUT_VALIDATION`과 `DB_CONSTRAINT`는 접두 조건에 삼켜지지 않고 각 원문 상호를 그대로 표시했다. R20~R23 안전선과 정본 7,253건도 모두 유지됐다.

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- 검증 HEAD: `376d7aa05ebf088d2e61ef2ca19e807d7b8cc255`
- 관리자 화면: 현재 워크트리 소스 Vite `http://127.0.0.1:5224/admin/partners`
  - listener 명령행에서 현재 워크트리의 `vite.web.config.ts --host 127.0.0.1 --port 5224`를 확인했다.
- gateway/auth: `http://127.0.0.1:8080`, 로그인 `POST /auth/login`
- 공유 partner: `http://127.0.0.1:8095`, health HTTP 200 / `UP`
  - 컨테이너 환경 표기는 `IMAGE_REVISION=HEAD-R24`이다.
  - 현재 Git SHA에서 `:services:partner-service:bootJar`를 다시 실행해 입력 최신·BUILD SUCCESSFUL을 확인했다.
  - HEAD 로컬 JAR SHA-256: `FD2DC39B89CDE64447EC20F5D50C4BF3E8B94672B3A7E837C178A33856C435D6`
  - 실행 `/app/app.jar` SHA-256: `FD2DC39B89CDE64447EC20F5D50C4BF3E8B94672B3A7E837C178A33856C435D6`
  - 따라서 축약 환경표기와 별개로 배포 JAR은 HEAD `376d7aa05` 산출물과 일치한다.
- 격리 partner: `http://127.0.0.1:48095`, 동일 `partner_r9`에서 정본·정상 CSV를 재검증했다.
- 실제 호출 API:
  - 화면 적재: `POST http://localhost:8080/admin/partners/imports/ecount`
  - 화면 보류: `GET http://localhost:8080/admin/partners/imports/ecount/rejections?sourceFileHash=...&page=...&size=100`
  - 정본: `POST http://127.0.0.1:48095/admin/partners/imports/ecount-xlsx`
  - 정상 CSV: `POST http://127.0.0.1:48095/admin/partners/imports/ecount`
  - cleanup: `DELETE http://127.0.0.1:8080/admin/partners/{partnerCode}` 및 `DELETE http://127.0.0.1:48095/admin/partners/{partnerCode}`
- DB에는 계수·원문 대조용 `SELECT`만 실행했다. 직접 `INSERT/UPDATE/DELETE`는 하지 않았다.
- 로그인 자격은 산출물에 남기지 않고 `<redacted>`로 기록했다.

## 1. R24 표시 정합성 · 사유별 대조

실 관리자 화면에서 혼합 인코딩 CSV와 R25 사유 표본을 순서대로 업로드했다. Playwright production transport route/adapter 우회는 0개이고, R23과 같은 updater 시작 완료 주입만 사용했다.

| 사유 | 물리 행 | 적재 결과 응답 `rawName` | 페이지 응답 `rawName` | 실제 화면 | 판정 |
|---|---:|---|---|---|---|
| `CSV_ENCODING` | 3 | `읽을 수 없음` | `읽을 수 없음` | `읽을 수 없음`, `����` 0건 | 일치 |
| 정상 읽힘 | 4 | 보류 아님 | 보류 아님 | `SOL1154R25-ENC-GOOD / R25 읽을 수 있는 정상 상호` | 코드·상호 완전 보존 |
| `INPUT_VALIDATION` | 3 | `R25 입력 검증 원문 상호` | 같은 원문 | 같은 원문 | `CSV_ENCODING%`에 안 잡힘 |
| `DB_CONSTRAINT` | 4 | 216자 원문 상호 | 같은 216자 원문 | 같은 원문 | `CSV_ENCODING%`에 안 잡힘 |

못 읽는 행의 화면 행 번호는 `3`, 코드는 `SOL1154R25-ENC-BAD`다. 정상 4행은 실제 거래처 목록까지 도달해 값 그대로 보였다.

- [CSV_ENCODING 응답·화면 및 사유별 JSON](../qa/2026-08-10-1154-r25/01-reason-matrix.json)
- [CSV_ENCODING 화면](../qa/2026-08-10-1154-r25/00-encoding-parity.png)
- [INPUT_VALIDATION·DB_CONSTRAINT 화면](../qa/2026-08-10-1154-r25/01-reason-matrix.png)

## 2. `raw_name` 소비자 전수

`rg -i "raw_name|rawName"`로 production source를 전수하고, 동명이나 다른 도메인의 입금자명 `raw_name`은 거래처 staging과 분리했다. 거래처 staging의 `raw_name`을 **DB에서 읽는 production 코드는 페이지 조회 한 곳뿐**이다.

| 경로 | 읽는 원천 | 사용자에게 보이는 값 | R24 영향 / 잔여 경로 |
|---|---|---|---|
| staging UPSERT | CSV `cells[4]` → `staging.ecount_partner_raw.raw_name` | 직접 표시 없음 | 원문 저장자이며 소비자 아님 |
| 적재 결과 응답 | import loop의 메모리 `rawName` | `CSV_ENCODING`은 `읽을 수 없음`; `INPUT_VALIDATION`·`DB_CONSTRAINT`는 원문 | R22 경로. 라이브 응답으로 대조 |
| 페이지 조회 API | staging `raw_name`을 읽는 유일한 SQL (`EcountPartnerImporter:814-822`) | `reject_reason LIKE 'CSV_ENCODING%'`만 `읽을 수 없음`, 나머지는 원문 | R24 수정 경로. 사유별 라이브 대조 통과 |
| 보류 패널 | 페이지 DTO `row.rawName` | 서버 값을 그대로 표시, 빈값만 fallback | 페이지 응답과 화면 일치 |
| 거래처 Excel / Aligo 내보내기 | active `Partner.getName()` | 적재에 성공한 정상 거래처 상호 | staging `raw_name`을 읽지 않음. 보류 행은 Partner가 없어 도달 불가 |
| `TaxInvoiceBatchService` | slip query의 `raw.get("partnerName")` 스냅샷 | `cleanCustomerName(partnerName)`인 공급받는자명 | staging `raw_name`을 읽지 않음 |
| `HometaxExportService` | slip query의 `raw.get("partnerName")` 스냅샷 | `cleanCustomerName(partnerName)`인 공급받는자명 | staging `raw_name`을 읽지 않음 |

따라서 R23처럼 같은 staging 원문을 별도로 읽는 미수정 소비자는 더 없다. 내보내기·배치에 보류 원문이 누수되는 경로도 없다.

## 3. 정본 7,253건 안전선

정본 XLSX를 격리 partner에 다시 업로드했다. 결과는 안전선과 전부 일치했다.

```text
totalRows 7253 · activeCount 7253 · rejectedNullName 0 · excludedTrailerRows 1
registrationDateParsedCount 2423 · createdAtLoadTimeCount 4830
sourceFileHash 064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619
```

거래처 `1068689215`는 정본 업로드에 포함된 정상 갱신 외 별도로 조회·조작하지 않았다.

정상 CSV 4종도 보류 0건이고 DB 문자열이 입력과 완전히 같았다.

| 표본 | 보류 | 저장 문자열 |
|---|---:|---|
| UTF-8 한글 | 0 | 완전 일치 |
| UTF-8 ASCII | 0 | 완전 일치 |
| CP949 한글 | 0 | 완전 일치 |
| UTF-8 구두점·역슬래시 | 0 | 완전 일치 |

근거: [정본·정상 CSV JSON](../qa/2026-08-10-1154-r25/04-master-and-normal-csv.json)

## 4. R20~R23 회귀

최종 R25 suite 원문은 `4 passed (1.0m)`다.

- 대량 held: 201건 파일에서 `1 / 3 → 2 / 3 → 3 / 3`, 마지막 다음 버튼 비활성 확인.
- 새 파일: 다른 hash의 201건 파일 업로드 후 `1 / 3`, 첫 행 번호 `3`으로 초기화.
- mock 격리: `VITE_API_BASE_URL=http://127.0.0.1:1`, `VITE_MOCK_MODE=1`, 실제 XHR/fetch **0건**.
- 정상 CSV 4종: 보류 0건, 문자열 완전 보존.
- 짧은 `EcountPartnerImportResult` 생성자: R23→HEAD 추가 **0곳**.

근거:

- [페이지 끝·초기화 JSON](../qa/2026-08-10-1154-r25/02-pagination-reset.json)
- [마지막 페이지](../qa/2026-08-10-1154-r25/02-last-page.png)
- [새 파일 1페이지 초기화](../qa/2026-08-10-1154-r25/03-second-file-reset.png)
- [mock 격리 JSON](../qa/2026-08-10-1154-r25/03-mock-isolation.json)

## 5. 머지 게이트

- PR #1154 head: `376d7aa05ebf088d2e61ef2ca19e807d7b8cc255`
- GitHub CI: 모든 check **pass**, PR `mergeStateStatus=CLEAN`.
- 하네스 거짓 green 가드: **62/62 pass** (`162302ms`), H-2 포함.
- R25 `_local`: **0개**.
- partner-service 전체 test: `BUILD SUCCESSFUL`.
- desktop import/panel/mock: `3 files / 145 tests pass`.
- desktop typecheck 및 real-QA scope: exit 0.
- 배포 health: HTTP 200 / `UP`.
- `tools/legacy-gas/**`: 변경 0.

## 6. cleanup 잔여

R25 정상 거래처는 사용자 DELETE API로 정리했다. staging에는 삭제 API가 없어 표본 원문은 남는다.

| DB | 전체 active | 전체 soft-deleted | 전체 staging | R25 active | R25 soft-deleted | R25 staging |
|---|---:|---:|---:|---:|---:|---:|
| 공유 `partner_db` | 8,309 | 14 | 19,637 | 0 | 2 | 407 |
| 격리 `partner_r9` | 7,261 | 2,054 | 17,770 | 0 | 4 | 4 |
| 합계 R25 | — | — | — | **0** | **6** | **411** |

R25 staging 411건은 공유 혼합 2 + INPUT seed 1 + 사유 2 + 페이지 201×2 = 407, 격리 정상 CSV 4다. 같은 hash 재실행은 `(source_file_hash, source_row_no)` upsert라 행 수를 늘리지 않았다.

## 7. 신규 파일 목록

- `clients/desktop/playwright/1154-r25-sol-reconvergence-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1154-r25-sol-reconvergence-real-qa/1154-r25-sol-reconvergence.spec.ts`
- `docs/qa/2026-08-10-1154-r25/00-encoding-parity.png`
- `docs/qa/2026-08-10-1154-r25/01-reason-matrix.json`
- `docs/qa/2026-08-10-1154-r25/01-reason-matrix.png`
- `docs/qa/2026-08-10-1154-r25/02-last-page.png`
- `docs/qa/2026-08-10-1154-r25/02-pagination-reset.json`
- `docs/qa/2026-08-10-1154-r25/03-mock-isolation.json`
- `docs/qa/2026-08-10-1154-r25/03-second-file-reset.png`
- `docs/qa/2026-08-10-1154-r25/04-master-and-normal-csv.json`
- `docs/dev-reports/2026-08-10-1154-r25-sol-reconvergence.md`

모든 QA 파일 목적지는 `resolveQaShotsDir` 반환 경로에서 파생되고, `resolveQaCredential`은 실 테스트 본문 `try/catch` 안에서만 호출한다.

## 8. 못 한 것

- 성능(1,000행 처리 시간)은 지시대로 측정·수정하지 않았다.
- 보류 행으로 세금계산서 배치나 내보내기 파일을 만들지는 않았다. 해당 행은 Partner로 승격되지 않고 두 서비스도 staging `raw_name`을 읽지 않아 사용자 경로가 구조적으로 존재하지 않는다.
- commit / push / merge는 하지 않았다.
- 공유 DB 직접 DML, 거래처 `1068689215` 별도 조작, 다른 워크트리·main checkout은 하지 않았다.
