# PR #1154 R21 SOL 5.6 — 적대검증 재수렴

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- 검증 HEAD: `d03e652e2c0600a060fe345716fe9b0ce6d768c7`
- 관리자 화면: HEAD 소스를 Vite `http://127.0.0.1:5224/#/admin/partners`에서 띄운 Chromium 화면
- gateway: `http://127.0.0.1:8080`, health `UP`
- partner R21: `http://127.0.0.1:48095`, `IMAGE_REVISION=d03e652e2c0600a060fe345716fe9b0ce6d768c7`, health `UP`
  - HEAD fresh `bootJar` SHA-256: `A27FA470EB45EBDF9ED842D38824AB65AE1987D2FBED7F1BC781998D454AFA60`
  - 실행 `/app/app.jar` SHA-256: `A27FA470EB45EBDF9ED842D38824AB65AE1987D2FBED7F1BC781998D454AFA60`
- accounting: `http://127.0.0.1:28087`, health `UP`
- 실제 호출 API:
  - `POST http://127.0.0.1:8080/auth/login`
  - UI 원경로 `POST http://localhost:8080/admin/partners/imports/ecount`
  - 우회 적재 `POST http://127.0.0.1:48095/admin/partners/imports/ecount`
  - 정본 `POST http://127.0.0.1:48095/admin/partners/imports/ecount-xlsx`
  - 페이지 `GET http://127.0.0.1:48095/admin/partners/imports/ecount/rejections?sourceFileHash=...&page=...&size=100`
  - 기존 등록 `POST http://localhost:8080/api/v1/partners/full`
  - cleanup `DELETE http://127.0.0.1:48095/admin/partners/{partnerCode}` 및 `DELETE http://127.0.0.1:8080/admin/partners/{partnerCode}`
- 로그인 자격은 `<redacted>` 처리했다. 보고서와 QA JSON/PNG에 원문 자격을 쓰지 않았다.

## 1. 판정

**실 사용자 경로로 재현 가능한 결함이 있다.** R20 화면은 보이지만 production 계약 그대로는 적재 결과와 보류 패널에 도달하지 못한다. R21 실측 결함은 5건이다.

1. `partnerImportApi.ts`는 업로드와 페이지 응답을 `response.data.data`로 읽지만 partner controller는 둘 다 raw DTO를 반환한다. 작은 파일도 적재 결과가 `undefined`가 되고 페이지는 `data.items`에 도달하지 못한다.
2. 공통 Axios timeout은 10초인데 1,000행 적재는 backend에서 약 4분 뒤 끝났다. UI는 먼저 실패 문구로 끝나고 완료 결과를 표시하지 않는다.
3. 혼합 인코딩 파일의 실제 행 번호 3·4는 맞지만, 읽을 수 있는 4행의 코드·상호도 `읽을 수 없음`으로 소실된다.
4. 패널이 200건 파일의 2페이지에 있는 상태에서 201건 새 파일을 올리면 새 hash의 1페이지로 초기화되지 않고 곧바로 `2 / 3`을 표시한다.
5. `VITE_MOCK_MODE=1`에서 새 업로드 API handler가 없어 실제 `http://localhost:8080` XHR을 시도한다.

첫 과제의 캡처는 지시대로 포기하지 않았다. 이미 gateway가 끝낸 1,000행의 live staging/page API를 사용하되, 위 1번 계약 결함만 우회하려고 raw 응답을 UI가 기대하는 `{ data: raw }`로 감쌌다. 따라서 캡처는 production 코드 그대로 성공한 증거가 아니라 **명시적 transport adapter 우회 후 실제 persisted 1,000행을 화면에서 넘긴 증거**다.

## 2. 첫 과제 — 관리자 화면 1,000건 10페이지

### 2.1 gateway 정체 원문과 우회

UI 원경로에서 45초 안에 결과 패널이 열리지 않았다. 제품 원문은 다음 세 축이 일치한다.

```text
clients/desktop/src/renderer/api/client.ts
timeout: 10_000

PartnersPage 사용자 표시
거래처 파일 적재에 실패했습니다. 파일 형식과 권한을 확인하세요.

partner log
2026-08-09T17:06:50.577Z ... MIG-1 import 완료 —
total=1000 imported=0 updated=0 rejectedNullName=1000 ...
hash=AB2372AC0707DA1F202A37D5E8C72939B9BB367FBF8039ED1AC86CF68EC9763D
```

gateway 자체의 multipart 오류 원문은 남지 않았고 partner에는 요청이 도달해 완료됐다. 막힌 곳은 **10초 UI timeout과 약 4분 동기 처리의 시간 계약**, 그리고 완료 후에도 raw/envelope가 어긋나는 응답 계약이다.

우회는 다음처럼 했다.

1. gateway 처리로 실제 저장된 hash의 `48095` 페이지 API가 `totalElements=1000`임을 확인했다.
2. 업로드 완료 raw DTO를 `{data: raw}`로 감싸 관리자 화면의 적재 결과 state에 전달했다.
3. 페이지 GET은 매 클릭마다 `48095` live API를 호출하고 raw 페이지를 `{data: raw}`로만 감쌌다.
4. 화면의 `다음` 버튼을 9번 눌러 `1 / 10`에서 `10 / 10`까지 갔다.

### 2.2 캡처

- 진입점: [01-entry.png](../qa/2026-08-10-1154-r21/01-entry.png)
- 첫 페이지: [02-first-page.png](../qa/2026-08-10-1154-r21/02-first-page.png)
- 마지막 페이지: [03-last-page.png](../qa/2026-08-10-1154-r21/03-last-page.png)
- 원문: [01-admin-1000.json](../qa/2026-08-10-1154-r21/01-admin-1000.json)

```text
규모 1,000건 · page size 100 · 10페이지
첫 행  3    · 거래처명 빈값 · SOL1154R21-BULK-0001 · 읽을 수 없음
마지막 1002 · 거래처명 빈값 · SOL1154R21-BULK-1000 · 읽을 수 없음
```

행 번호·사유·거래처코드·상호 네 열이 첫 페이지와 마지막 페이지 모두 보였다.

## 3. ② 인코딩 보류 행 번호

물리 파일을 직접 대조했다.

```text
line 1 metadata
line 2 header
line 3 SOL1154R21-ENC-BAD  / 상호 바이트 훼손
line 4 SOL1154R21-ENC-GOOD / R21 읽을 수 있는 정상 상호
```

실 응답과 화면의 행 번호는 `3, 4`로 물리 줄과 일치했다. `읽을 수 없음`도 빈 값과 다른 명시 문자열로 보였다.

그러나 반대급부가 깨졌다. line 4는 UTF-8로 읽을 수 있는 코드와 상호인데 응답·화면 모두 아래처럼 소실했다.

```json
{
  "rowNumber": 4,
  "reason": "CSV_ENCODING",
  "rawPartnerCode": "읽을 수 없음",
  "rawName": "읽을 수 없음"
}
```

근거: [03-mixed-encoding.json](../qa/2026-08-10-1154-r21/03-mixed-encoding.json), [04-mixed-encoding.png](../qa/2026-08-10-1154-r21/04-mixed-encoding.png).

## 4. ③ R20 신규 표면

### 4.1 보류 0건

정상 1행 CSV의 실 응답은 `heldParseFailureRows=0`, `rejectedNullName=0`이었다. raw/envelope adapter 우회 화면에서는 `보류·거부 행이 없습니다.`를 표시하고 `partner-import-rejections` 패널은 만들지 않았다.

### 4.2 페이지 경계

- 200건: `totalPages=2`; 마지막 `2 / 2`, 100행, 다음 비활성.
- 201건: `totalPages=3`; 마지막 `3 / 3`, 1행, 마지막 row 203.
- 결함: 200건의 `2 / 2`에서 201건 새 파일을 올린 직후 `1 / 3`이 아니라 `2 / 3`, 첫 visible row 103이었다. `sourceFileHash` 변경 때 패널의 `page` state가 0으로 초기화되지 않는다.

근거: [04-surface-boundaries.json](../qa/2026-08-10-1154-r21/04-surface-boundaries.json), [07-panel-page-state.json](../qa/2026-08-10-1154-r21/07-panel-page-state.json).

### 4.3 PartnersPage 기존 기능

- 목록: 첫 화면 20행 표시.
- 검색: 정본 정상 거래처 `1068689215` 검색 결과에 실제 코드가 표시됐다. 이 코드에 별도 write를 하지 않았다.
- 등록: `신규 등록` → 4탭 form 진입 → 상호·사업자번호 입력 → 실제 `POST /api/v1/partners/full` HTTP 201 → 목록 복귀까지 완료했다. 생성된 R21 표본은 gateway DELETE로 정리했다.

### 4.4 mock hard gate

`VITE_MOCK_MODE=1`을 브라우저 내부 `isMockMode()`로 확인한 뒤 `importPartnerFile()`을 호출했다. mock handler가 0곳이라 다음 외부 XHR을 시도했다.

```text
POST http://localhost:8080/admin/partners/imports/ecount
```

Playwright 경계에서 `blockedbyclient`로 abort해 실제 외부 write는 없었다. 근거: [06-mock-hard-gate.json](../qa/2026-08-10-1154-r21/06-mock-hard-gate.json).

## 5. ④ 정본 7,253건 회귀

HEAD 배포본 `48095`에 정본 XLSX를 다시 올렸다. 실측은 안전선과 전부 일치했다.

```text
totalRows 7253
activeCount 7253
rejectedNullName 0
excludedTrailerRows 1
registrationDateParsedCount 2423
createdAtLoadTimeCount 4830
sourceFileHash 064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619
```

근거: [02-master-7253.json](../qa/2026-08-10-1154-r21/02-master-7253.json).

## 6. ⑤ R19 반대급부

정상 CSV 4종은 모두 보류 0건이고 저장 문자열이 입력과 완전 일치했다.

| 표본 | 보류 | 저장 문자열 |
|---|---:|---|
| UTF-8 한글 | 0 | `R21 정상 한글 상호` |
| UTF-8 ASCII | 0 | `R21 Normal Partner 123` |
| CP949 한글 | 0 | `R21 정상 CP949 한글상호` |
| UTF-8 구두점·역슬래시 | 0 | `R21 "따옴표" (주)삼한, 대리점/본점\창고` |

생성자 전수 결과:

- production `RemoteImportResult` 호출 1곳은 canonical 호출이며 짧은 생성자 호출은 0곳.
- production `SliceResult` 기존 호출은 7곳이다. R20 diff가 새로 추가한 `SliceResult` 호출은 0곳.
- R20 diff가 새로 추가한 `RemoteImportResult` 호출도 0곳.

근거: [05-normal-csv-cleanup.json](../qa/2026-08-10-1154-r21/05-normal-csv-cleanup.json).

## 7. cleanup 최종 잔여

DB 직접 INSERT/UPDATE/DELETE는 하지 않았다. 정본 업로드와 R21 표본만 write했고, 삭제는 사용자 API로 수행했다.

```text
R21 격리 partner_r9
active 0 · soft-deleted 5 · staging 1408

R21 기존 등록이 사용한 기본 partner_db
active 0 · soft-deleted 1 · staging 해당 없음

합계
active 0 · soft-deleted 6 · staging 1408
```

staging 1,408은 bulk 1,000 + exact 200 + non-exact 201 + 정상/0건 표본 5 + 혼합 인코딩 2다. soft-deleted 6은 정상 CSV/0건 표본 5와 실제 등록 표본 1이다. 정본 거래처 `1068689215`는 정본 업로드 갱신 외 별도 조작하지 않았다. 등록 cleanup 원문은 [08-registration-cleanup.json](../qa/2026-08-10-1154-r21/08-registration-cleanup.json)이다.

## 8. 증거 무결성

- `docs/qa/2026-08-10-1154-r21/` 하위 `_local`: 0개.
- R21 Playwright 디렉터리명은 `-real-qa`로 끝난다.
- `docs/qa` 경로 상수는 `resolveQaShotsDir(...)` 반환값 `shots` 하나뿐이다.
- 모든 `writeFileSync`와 `page.screenshot` 목적지는 `shots`에서 파생된다.
- `resolveQaCredential`은 각 실 테스트 본문 `try/catch` 안에서만 호출했다.
- mock hard gate XHR은 browser route에서 abort해 외부 write를 막았다.
- 하네스 거짓 green 가드: 62/62 통과.
- desktop typecheck 통과.

## 9. 신규 파일 목록

- `clients/desktop/playwright/1154-r21-sol-reconvergence-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1154-r21-sol-reconvergence-real-qa/1154-r21-sol-reconvergence.spec.ts`
- `docs/qa/2026-08-10-1154-r21/01-admin-1000.json`
- `docs/qa/2026-08-10-1154-r21/01-entry.png`
- `docs/qa/2026-08-10-1154-r21/02-first-page.png`
- `docs/qa/2026-08-10-1154-r21/02-master-7253.json`
- `docs/qa/2026-08-10-1154-r21/03-last-page.png`
- `docs/qa/2026-08-10-1154-r21/03-mixed-encoding.json`
- `docs/qa/2026-08-10-1154-r21/04-mixed-encoding.png`
- `docs/qa/2026-08-10-1154-r21/04-surface-boundaries.json`
- `docs/qa/2026-08-10-1154-r21/05-normal-csv-cleanup.json`
- `docs/qa/2026-08-10-1154-r21/06-mock-hard-gate.json`
- `docs/qa/2026-08-10-1154-r21/07-panel-page-state.json`
- `docs/qa/2026-08-10-1154-r21/08-registration-cleanup.json`
- `docs/dev-reports/2026-08-10-1154-r21-sol-reconvergence.md`

## 10. 못 한 것

- 결함 수정은 이번 요청 범위가 적대검증이므로 하지 않았다.
- production 계약을 그대로 둔 관리자 화면에서는 업로드 결과·보류 패널에 도달할 수 없어, 첫 과제 캡처에 raw→envelope transport adapter 우회를 사용했다. 우회 없는 성공 캡처는 만들 수 없다.
- commit/push는 하지 않았다. `tools/legacy-gas/**`, 다른 워크트리, main은 변경하지 않았다.
