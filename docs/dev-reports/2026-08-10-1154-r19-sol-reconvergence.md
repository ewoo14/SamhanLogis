# PR #1154 R19 SOL 5.6 — 적대검증 재수렴

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- 검증 HEAD: `bb06ead8cde2cbae9b0067f4594ddf054ee5eaf6`
- accounting: `http://127.0.0.1:28087`, `IMAGE_REVISION=bb06ead8cde2cbae9b0067f4594ddf054ee5eaf6`, `/app/app.jar` SHA-256 `23D218639BA96BFFC8970F5541AE9D959A8588053869FA5DA803191C6D705DE0`, health `UP`
- partner: `http://127.0.0.1:48095`, `IMAGE_REVISION=bb06ead8cde2cbae9b0067f4594ddf054ee5eaf6`, `/app/app.jar` SHA-256 `E53F56E49B1020311C88071BFD8D3DD6C23FD6A4F8631E8BC5E019937E3E647`, health `UP`
- 관리자 화면: HEAD 소스를 Vite `http://127.0.0.1:5224/#/admin/partners`로 띄운 Chromium 실 화면
- 실제 호출 API:
  - `POST http://127.0.0.1:8080/auth/login`
  - `POST http://127.0.0.1:48095/admin/partners/imports/ecount-xlsx`
  - `POST http://127.0.0.1:48095/admin/partners/imports/ecount`
  - `POST http://127.0.0.1:28087/admin/ecount/reimport/mig-1`
  - `GET http://127.0.0.1:48095/admin/partners/imports/ecount/rejections?sourceFileHash=...&page=...&size=100`
  - `GET http://127.0.0.1:48095/admin/partners/{partnerCode}`
  - cleanup `DELETE http://127.0.0.1:48095/admin/partners/{partnerCode}`
- mock API 호출은 없다. 자격 해석은 두 Playwright 테스트 본문 `try/catch` 안에서만 했다. 원문·보고서·캡처 자격 문자열 검색은 0건이다.

## 1. 판정

**실 사용자 경로로 재현 가능한 결함이 있다.** 원 결함 5건 중 ①·③·④의 저장 훼손·⑤는 닫혔지만, **②는 API만 생기고 관리자 화면 소비 경로가 없어 닫히지 않았다.** 또한 R17의 혼합/훼손 인코딩 fallback은 `����` 저장은 막지만 **행 0·코드 공백·상호 공백**만 돌려 관리자가 고칠 행을 알 수 없는 별도 도달 결함을 만들었다.

따라서 최종 결함은 2건이다.

1. 대량 보류 1,000건 조회 API는 10페이지/1,000행을 주지만 실제 관리자 화면에는 보류·거부 조회 진입점이 없다.
2. 정상 UTF-8 파일의 상호 한 행만 훼손된 혼합 인코딩 파일은 HTTP 200으로 보류되지만 `rowNumber=0`, `rawPartnerCode=""`, `rawName=""`, `totalRows=0`이라 수정 대상 행을 특정할 수 없다.

근거 묶음은 [02-r15-five-and-r17-countertrade-http.json](../qa/2026-08-10-1154-r19/02-r15-five-and-r17-countertrade-http.json), accounting 실 원문은 [02a-accounting-reimport-raw.json](../qa/2026-08-10-1154-r19/02a-accounting-reimport-raw.json), 실 관리자 화면은 [03-admin-partners-no-rejection-ui.png](../qa/2026-08-10-1154-r19/03-admin-partners-no-rejection-ui.png)이다.

## 2. ① R15의 5건 재현 결과

| # | R15 결함 | R19 실측 | 판정 |
|---:|---|---|---|
| 1 | held 1,000건에서 슬라이스 전체 `FAILED` | accounting HTTP 200, bulk detail `PROCESSED_WITH_REJECTIONS`, `heldParseFailureRows=1000`, `infrastructureFailureRows=0` | 닫힘 |
| 2 | 20건 cap으로 980건 상세 소실 | API는 `size=100` 10페이지를 실제 호출해 `totalElements=1000`, 첫 행 3/`BULK-0001`, 마지막 행 1002/`BULK-1000`까지 1,000행 확인. 그러나 실제 관리자 화면에는 조회 진입점이 없음 | **안 닫힘** |
| 3 | 빈 상호 사유·행 소실 | partner와 accounting `details[].rejectedSample`에 `rowNumber=3`, `REJECT_NAME_NULL`, `SOL1154R19-BLANK-NAME`, `rawName=""`; top-level `errors[].message`에도 `row=3` 도달 | 닫힘 |
| 4 | 상호가 `����`로 저장 | 혼합 훼손 파일은 저장되지 않고 `CSV_ENCODING` 보류, 응답에 `����` 없음 | 원 저장 훼손은 닫힘. 다만 아래 별도 결함 재현 |
| 5 | 역슬래시 소실 | 입력·정상 저장·held 표본 모두 `R19 "따옴표" (주)삼한, 대리점/본점\창고` 완전 일치 | 닫힘 |

### 2.1 결함 1 원문 축

accounting detail 실측:

```json
{
  "fileName": "거래처-Excel다운로드_R19_BULK_1000.csv",
  "status": "PROCESSED_WITH_REJECTIONS",
  "heldParseFailureRows": 1000,
  "infrastructureFailureRows": 0,
  "heldSample": ["응답 가드에 따라 20건"]
}
```

R15의 `application/octet-stream` converter 실패와 슬라이스 `FAILED`는 재현되지 않았다.

### 2.2 결함 2 — API와 실제 관리자 화면이 끊겨 있다

API 실측:

```text
GET .../ecount/rejections size=100 × page 0..9
totalElements 1000
합친 items 1000
first rowNumber 3 / SOL1154R19-BULK-0001
last  rowNumber 1002 / SOL1154R19-BULK-1000
```

실 관리자 화면 `/#/admin/partners`의 상호작용 요소 36개를 읽었다. 관련 기능은 `Excel 다운로드`, `신규 등록`, 검색, 상태/유형 필터, 삭제, 일반 목록 페이지뿐이었다. `업로드`, `가져오기`, `보류 행`, `거부 행` 또는 import/rejection/held test id는 0개였다. 화면 네트워크도 `/admin/partners/search`와 `/admin/partners/list-realtime`뿐이다.

production 클라이언트 전수 검색에서도 `/admin/partners/imports/ecount/rejections` 소비자는 0곳이다. 저장소 전체에서 이 문자열을 쓰는 실행 코드는 R16/R19 Playwright뿐이다. 따라서 R16의 `page.setContent` 증거 화면은 관리자 production UI가 아니며, 관리자는 API가 가진 1,000행을 화면에서 넘겨볼 수 없다.

### 2.3 결함 3 — 빈 상호 계약

```json
{
  "rowNumber": 3,
  "reason": "REJECT_NAME_NULL",
  "rawPartnerCode": "SOL1154R19-BLANK-NAME",
  "rawName": ""
}
```

위 객체가 partner 직접 응답과 accounting `details[].rejectedSample`에 도달했다. accounting `errors[]` DTO에는 별도 `rowNumber` 필드가 없지만 `message` 원문에 `row=3 reason=REJECT_NAME_NULL partnerCode=SOL1154R19-BLANK-NAME name=`이 있다.

### 2.4 결함 4의 원 수정과 새 반대급부

정상 UTF-8 파일의 상호 바이트만 `B0 A1 B3 AA`로 바꾼 실 multipart 요청 결과:

```json
{
  "totalRows": 0,
  "heldParseFailureRows": 1,
  "heldSample": [{
    "rowNumber": 0,
    "reason": "CSV_ENCODING",
    "rawPartnerCode": "",
    "rawName": ""
  }]
}
```

`����` 저장은 없으므로 R15 원 결함은 닫혔다. 그러나 원 파일은 데이터 1행이고 훼손 위치도 그 상호인데, 응답은 파일 전체를 행 0으로 만들고 staging에도 행 증거를 남기지 않는다. 관리자는 어느 행을 고쳐야 하는지 알 수 없다. 이는 테스트 품질 문제가 아니라 HTTP 200 실 사용자 응답 자체의 결함이다.

### 2.5 결함 5 문자열 일치

```text
입력          R19 "따옴표" (주)삼한, 대리점/본점\창고
정상 저장     R19 "따옴표" (주)삼한, 대리점/본점\창고
held rawName  R19 "따옴표" (주)삼한, 대리점/본점\창고
```

역슬래시뿐 아니라 따옴표·괄호·쉼표·정방향 슬래시도 함께 보존됐다.

## 3. ② R17 반대급부

| 실제 CSV | totalRows | 보류 | 거부 | 인프라 실패 | 저장 상호 |
|---|---:|---:|---:|---:|---|
| UTF-8 한글 | 1 | 0 | 0 | 0 | `R19 정상 한글 상호` |
| UTF-8 ASCII | 1 | 0 | 0 | 0 | `R19 Normal Partner 123` |
| MS949/CP949 한글 | 1 | 0 | 0 | 0 | `R19 정상 CP949 한글상호` |
| UTF-8 따옴표·괄호·쉼표·`/`·`\` | 1 | 0 | 0 | 0 | 입력과 완전 일치 |

정상 파일 오판은 재현되지 않았다. 특히 따옴표가 든 정상 행도 escape 비활성화 뒤 그대로 적재됐다. XLSX 정본은 아래처럼 동일 기준값을 유지했다.

## 4. ③ 정본 7,253건 회귀

실 원문: [01-master-7253-http.json](../qa/2026-08-10-1154-r19/01-master-7253-http.json), 캡처: [01-master-7253-http.png](../qa/2026-08-10-1154-r19/01-master-7253-http.png).

| 축 | 기준 | R19 실측 | 판정 |
|---|---:|---:|---|
| totalRows | 7,253 | 7,253 | 일치 |
| activeCount | 7,253 | 7,253 | 일치 |
| rejectedNullName | 0 | 0 | 일치 |
| excludedTrailerRows | 1 | 1 | 일치 |
| heldParseFailureRows | 0 | 0 | 일치 |
| infrastructureFailureRows | 0 | 0 | 일치 |
| registrationDateParsedCount | 2,423 | 2,423 | 일치 |
| createdAtLoadTimeCount | 4,830 | 4,830 | 일치 |
| sourceFileHash | `064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619` | 동일 | 일치 |
| imported / updated | 선행 상태 의존 | 0 / 7,253 | 참고, 결함 아님 |

거래처 `1068689215`는 정본에 포함된 상태로 정본 전용 API가 함께 갱신했다. 해당 코드 단건 API나 DB write는 하지 않았다.

## 5. ④ 짧은 생성자 전수

`new RemoteImportResult(`와 qualified `new EcountRemoteImportClient.RemoteImportResult(`, `new EcountReimportResult.SliceResult(`를 production/test로 나눠 전수 검색했다.

| 타입/인자 | production | test | 비고 |
|---|---:|---:|---|
| `RemoteImportResult` 3인자 | 0 | 4 | 짧은 호환 생성자 |
| `RemoteImportResult` 6인자 | 0 | 1 | 짧은 호환 생성자 |
| `RemoteImportResult` 7인자 | 0 | 2 | 짧은 호환 생성자 |
| `RemoteImportResult` 8인자 canonical | 1 (`EcountRemoteImportClient.java:121`) | 0 | production 신호 보존 |
| `SliceResult` 7인자 | 5 (`EcountReimportService.java:147,184,189,215,220`) | 0 | hash skip/실패 경로 |
| `SliceResult` 10인자 | 1 (`EcountReimportService.java:207`) | 0 | command 경로 |
| `SliceResult` 12인자 canonical | 1 (`EcountReimportService.java:175`) | 0 | remote 성공 경로 |

측정상 production의 짧은 생성자는 `RemoteImportResult` 0곳, `SliceResult` 6곳이다. 따라서 “R13/R15에서 둘 다 0곳”이라는 전제는 `SliceResult`까지 포함하면 틀렸다. R15 보고서 자체도 7인자 5곳·10인자 1곳을 기록했다. R16/R17이 **새로 추가한** 짧은 production 호출은 0곳이며, remote 성공 경로는 R16에서 canonical 12인자로 확장됐다.

## 6. cleanup 최종 잔여

[04-cleanup.json](../qa/2026-08-10-1154-r19/04-cleanup.json)과 종료 직후 DB SELECT가 일치한다.

```text
관리자 DELETE 요청 1004
HTTP 200 1004 / HTTP 404 0
active 0
soft-deleted 1004
staging 4018
```

staging이 4,018인 이유는 R19 재실행 중 accounting source hash 멱등 skip과 확정 경로 승격을 분리하느라 서로 다른 source hash 표본이 누적됐기 때문이다. 직접 DB INSERT/UPDATE/DELETE는 하지 않았고 staging 이력도 삭제하지 않았다.

## 7. 증거 무결성·실행 결과

- `docs/qa/2026-08-10-1154-r19/` 하위 `_local` 디렉터리: 0개.
- R19 스펙의 `docs/qa` 경로 상수: 1개, `resolveQaShotsDir(...)` 반환값에만 존재.
- 모든 `writeFileSync`·`page.screenshot` 목적지는 그 반환값 `shots` 또는 하위 `rawDir`에서 파생.
- `resolveQaCredential` 호출: 두 테스트 본문 `try/catch` 안에만 존재.
- QA/보고서 자격 문자열 검색: 0건.
- 실수로 기본 경로에 생성됐던 R19 `_local`은 즉시 제거 후 공식 `QA_SHOTS_DIR` + `QA_ALLOW_OVERWRITE=1` 승격 경로로 재실행했다. 최종 산출물에는 `_local`이 없다.

```text
.\gradlew.bat :services:partner-service:bootJar :services:accounting-service:bootJar --no-daemon
BUILD SUCCESSFUL

QA_SHOTS_DIR=.../docs/qa/2026-08-10-1154-r19 QA_ALLOW_OVERWRITE=1 \
npx playwright test -c playwright/1154-r19-sol-reconvergence-real-qa/playwright.config.ts
2 passed (1.4m)

npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts
1 file / 62 tests passed
```

하네스 green은 증거 작성 경로 무결성만 뜻한다. 위 제품 결함 2건을 닫는 근거로 사용하지 않았다.

## 8. 신규 파일 목록

- `clients/desktop/playwright/1154-r19-sol-reconvergence-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1154-r19-sol-reconvergence-real-qa/1154-r19-sol-reconvergence.spec.ts`
- `docs/qa/2026-08-10-1154-r19/01-master-7253-http.json`
- `docs/qa/2026-08-10-1154-r19/01-master-7253-http.png`
- `docs/qa/2026-08-10-1154-r19/02-r15-five-and-r17-countertrade-http.json`
- `docs/qa/2026-08-10-1154-r19/02-r15-five-and-r17-countertrade-http.png`
- `docs/qa/2026-08-10-1154-r19/02a-accounting-reimport-raw.json`
- `docs/qa/2026-08-10-1154-r19/03-admin-partners-no-rejection-ui.json`
- `docs/qa/2026-08-10-1154-r19/03-admin-partners-no-rejection-ui.png`
- `docs/qa/2026-08-10-1154-r19/04-cleanup.json`
- `docs/qa/2026-08-10-1154-r19/raw/거래처-Excel다운로드_R19_BLANK.csv`
- `docs/qa/2026-08-10-1154-r19/raw/거래처-Excel다운로드_R19_BULK_1000.csv`
- `docs/qa/2026-08-10-1154-r19/raw/거래처-Excel다운로드_R19_NORMAL-ASCII.csv`
- `docs/qa/2026-08-10-1154-r19/raw/거래처-Excel다운로드_R19_NORMAL-CP949.csv`
- `docs/qa/2026-08-10-1154-r19/raw/거래처-Excel다운로드_R19_NORMAL-PUNCT.csv`
- `docs/qa/2026-08-10-1154-r19/raw/거래처-Excel다운로드_R19_NORMAL-UTF8.csv`
- `docs/qa/2026-08-10-1154-r19/raw/거래처-Excel다운로드_R19_PUNCTUATION_HELD.csv`
- `docs/dev-reports/2026-08-10-1154-r19-sol-reconvergence.md`

## 9. 못 한 것

- 결함 수정은 요청 범위가 아니어서 하지 않았다.
- 이 세션의 인앱/외부 브라우저 연결 가능 목록이 0개라 Browser 플러그인 표면은 사용할 수 없었다. 대신 저장소가 지정한 Chromium Playwright로 HEAD Vite 실 화면을 직접 조작·캡처했다.
- accounting/partner 컨테이너는 R19 판단을 위해 HEAD로 재기동한 상태다. Vite 검증 서버도 로컬 5224에서 실행 중이다.
- commit/push는 하지 않았다. `tools/legacy-gas/**`와 다른 워크트리/main은 건드리지 않았다.
