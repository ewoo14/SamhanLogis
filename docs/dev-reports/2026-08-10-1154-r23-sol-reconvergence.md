# PR #1154 R23 SOL 5.6 — 적대검증 재수렴

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- 검증 HEAD: `573ecd1d31d3a7e758d0f85ed4bdd6f05bd945cc`
- 관리자 화면: HEAD 소스 Vite `http://127.0.0.1:5224/#/admin/partners`를 Chromium으로 실행했다. 캡처 종료 후 Vite는 정지했다.
- gateway: `http://127.0.0.1:8080`, health `UP`
- 실 사용자 경로 partner: `http://127.0.0.1:8095`, health `UP`
  - `IMAGE_REVISION=573ecd1d31d3a7e758d0f85ed4bdd6f05bd945cc`
  - fresh HEAD `bootJar` SHA-256: `4AB29F77A03808262BA65B7938028250E28F1E1856765C94B8E5DDBA2F9ECFC7`
  - 실행 `/app/app.jar` SHA-256: `4AB29F77A03808262BA65B7938028250E28F1E1856765C94B8E5DDBA2F9ECFC7`
- 격리 partner: `http://127.0.0.1:48095`, health `UP`
  - `IMAGE_REVISION=573ecd1d31d3a7e758d0f85ed4bdd6f05bd945cc`
  - 실행 `/app/app.jar` SHA-256도 `4AB29F77A03808262BA65B7938028250E28F1E1856765C94B8E5DDBA2F9ECFC7`
- 실제 호출 API:
  - 로그인 `POST http://127.0.0.1:8080/auth/login`
  - 화면 적재 `POST http://localhost:8080/admin/partners/imports/ecount`
  - 화면 보류 `GET http://localhost:8080/admin/partners/imports/ecount/rejections?sourceFileHash=...&page=...&size=100`
  - 정본 `POST http://127.0.0.1:48095/admin/partners/imports/ecount-xlsx`
  - 정상 CSV `POST http://127.0.0.1:48095/admin/partners/imports/ecount`
  - cleanup `DELETE http://127.0.0.1:8080/admin/partners/{partnerCode}` 및 `DELETE http://127.0.0.1:48095/admin/partners/{partnerCode}`
  - DB에는 계수·문자열 대조용 `SELECT`만 실행했다. 직접 `INSERT/UPDATE/DELETE`는 하지 않았다.
- 로그인 자격은 보고서·JSON·PNG에 남기지 않았고 `<redacted>`로 취급했다.

### 배포 중 선재 Docker bind 실패와 복구

기존 공유 `samhan-partner-service`는 다른 워크트리 `t1113`의 raw 디렉터리를 bind하고 있었다. HEAD JAR 재기동 시 다음 원문으로 기존 컨테이너가 시작되지 않았다.

```text
Error response from daemon: error while creating mount source path
'/run/desktop/mnt/host/c/dev/Samhan-Public/.claude/worktrees/t1113/docs/migration/ecount-data/raw':
mkdir .../t1113/docs: file exists
```

다른 워크트리를 수정하지 않았다. 기존 컨테이너는 `samhan-partner-service-r23-backup`이라는 정지 상태 이름으로 보존하고, 같은 `partner_db`·`samhan-net`·`8095`에 현재 워크트리 HEAD JAR을 bind한 `samhan-partner-service`를 띄웠다. 위 SHA·health는 이 대체 컨테이너에서 다시 잰 값이다.

### updater 오버레이 회피와 실 사용자 판정

R23 하네스에서는 `samhanAuth`와 함께 QA 전용 `samhanUpdater`를 주입하고 `onStatus({kind: 'not-available'})`로 시작 확인을 종료했다. transport·API에는 route/adapter를 설치하지 않았다.

R22의 오버레이는 이 개발 하네스에서는 실 배포 updater DNS 오류가 아니었다. 측정 근거는 다음과 같다.

1. R22 화면은 Electron main이 없는 plain Vite Chromium이었다.
2. R22 스펙이 `samhanAuth`를 주입하여 `isElectronPlatform=true`로 만들었지만 `samhanUpdater`는 주입하지 않았다.
3. `AppVersionGate`는 이 조건에서 동일한 일반 문구 `업데이트 실패: 업데이트에 실패했습니다...`를 자체 생성한다.
4. `intranet.example`은 production 설정값이 아니라 updater 오류 비공개를 검증하는 test fixture에만 있다. production builder는 외부 `DESKTOP_UPDATE_URL`이 없으면 빌드 단계에서 값을 만들지 못한다.

따라서 **R22 개발 화면의 오버레이는 실 사용자 결함이 아니다.** 실제 packaged 배포본의 feed 설정이 틀리면 일반 오류 알림은 뜰 수 있지만, 이 저장소와 R22 실행에서 그런 배포본은 관측되지 않았다.

## 1. 판정

**실 사용자 경로로 재현 가능한 결함이 1건 있다.**

- 혼합 인코딩의 못 읽는 3행은 결과 응답 `heldSample.rawName`에서는 `읽을 수 없음`인데, 실제 보류 패널은 staging 원문 치환문자 `����`를 표시한다.

R22가 고친 봉투·mock handler·읽히는 행 보존·행 번호·새 파일 페이지 초기화는 실 경로에서 도달했다. 성능 4분은 재현되지 않았으며 별도 성능 결함으로 판정하지 않는다.

## 2. 첫 과제 — 우회 없는 화면 캡처

실행 원문:

```text
Running 1 test using 1 worker
① 우회 없는 관리자 화면 적재→보류→끝 페이지→새 파일 1페이지 초기화
1 passed (5.6s)
```

화면의 실제 네트워크는 다음 순서였다.

```text
POST http://localhost:8080/admin/partners/imports/ecount -> 200
GET  http://localhost:8080/admin/partners/imports/ecount/rejections?...page=0&size=100 -> 200
GET  ...page=1&size=100 -> 200
GET  ...page=2&size=100 -> 200
POST 새 201행 파일 -> 200
GET  새 hash ...page=0&size=100 -> 200
```

첫 파일은 201건·3페이지였다. `1 / 3`에서 `다음`을 두 번 눌러 `3 / 3`과 다음 버튼 비활성을 확인했다. 다른 hash의 201건 파일을 다시 올린 뒤 화면은 `1 / 3`, 첫 행 번호 `3`으로 초기화됐다. production transport adapter, Playwright route, direct partner 우회는 모두 0개다.

- [01-entry.png](../qa/2026-08-10-1154-r23/01-entry.png)
- [02-first-page.png](../qa/2026-08-10-1154-r23/02-first-page.png)
- [03-last-page.png](../qa/2026-08-10-1154-r23/03-last-page.png)
- [04-second-file-reset.png](../qa/2026-08-10-1154-r23/04-second-file-reset.png)
- [01-live-panel.json](../qa/2026-08-10-1154-r23/01-live-panel.json)

## 3. ② mock 격리

직접 실행 원문:

```text
$env:VITE_API_BASE_URL='http://127.0.0.1:1'
$env:VITE_MOCK_MODE='1'
npx vitest run src/renderer/api/partnerImportApi.test.ts \
  src/renderer/routes/admin/PartnerImportRejectionPanel.test.tsx \
  src/renderer/api/mock.test.ts

✓ partnerImportApi.test.ts (2 tests)
✓ mock.test.ts (140 tests)
✓ PartnerImportRejectionPanel.test.tsx (3 tests)
Test Files 3 passed
Tests 145 passed
```

같은 두 환경변수로 Vite를 `5233`에 띄우고 실제 관리자 mock 화면에서 CSV를 올렸다. Playwright가 관측한 `127.0.0.1:1`의 `xhr`/`fetch`는 **0건**이다. 근거: [02-mock-isolation.json](../qa/2026-08-10-1154-r23/02-mock-isolation.json).

## 4. ③ 혼합 인코딩과 ③-b 행 번호

물리 파일은 다음 두 데이터 행이다.

```text
row 3  SOL1154R23-ENC-BAD  / 상호 바이트 훼손
row 4  SOL1154R23-ENC-GOOD / R23 읽을 수 있는 정상 상호
```

실 결과:

```text
totalRows=2
heldParseFailureRows=1
heldSample rowNumber=3, rawPartnerCode=SOL1154R23-ENC-BAD, rawName=읽을 수 없음
읽히는 row 4: 거래처 목록에서 코드·상호 완전 표시
```

③-b는 유지됐다. 못 읽는 행의 화면 행 번호는 `3`이다. 읽을 수 있는 4행은 보류되지 않고 실제 거래처 목록에서 `SOL1154R23-ENC-GOOD / R23 읽을 수 있는 정상 상호`로 보였다.

그러나 못 읽는 행의 보류 패널 상호 셀은 `읽을 수 없음`이 아니라 **`����`**다. reason·코드·행 번호는 보이지만 사용자용 명시 문자열 계약이 실제 페이지 조회에서 소실된다.

- [05-mixed-encoding.png](../qa/2026-08-10-1154-r23/05-mixed-encoding.png)
- [05b-mixed-readable-row.png](../qa/2026-08-10-1154-r23/05b-mixed-readable-row.png)
- [03-mixed-encoding.json](../qa/2026-08-10-1154-r23/03-mixed-encoding.json)

## 5. ④ 정본 7,253건 회귀

HEAD 격리 partner에 정본 XLSX를 다시 올렸다. 실행 원문은 `1 passed (53.3s)`이며 안전선과 전부 일치했다.

```text
totalRows 7253
activeCount 7253
rejectedNullName 0
excludedTrailerRows 1
registrationDateParsedCount 2423
createdAtLoadTimeCount 4830
sourceFileHash 064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619
```

거래처 `1068689215`는 정본 적재에 포함된 정상 갱신 외 별도 조회·조작을 하지 않았다.

## 6. 정상 CSV 4종 반대급부

네 표본 모두 보류 0건이고 DB 저장 문자열이 입력과 완전히 같았다.

| 표본 | 보류 | 저장 문자열 일치 |
|---|---:|---:|
| UTF-8 한글 | 0 | 예 |
| UTF-8 ASCII | 0 | 예 |
| CP949 한글 | 0 | 예 |
| UTF-8 구두점·역슬래시 | 0 | 예 |

근거: [04-master-and-normal-csv.json](../qa/2026-08-10-1154-r23/04-master-and-normal-csv.json).

## 7. ⑤ 성능 — 측정만

R21의 약 4분은 현재 HEAD·gateway·공유 DB에서 재현되지 않았다. fresh 1,000행 보류 파일을 관리자 화면에서 우회 없이 올린 실측은 다음과 같다.

```text
파일 선택 시작 → POST request             1,036 ms
POST request → 첫 DB active 관측            269 ms
첫 DB active → 마지막 DB active 관측       1,600 ms
마지막 DB active 관측 → HTTP response        543 ms
POST request → HTTP 200 총합               2,412 ms
```

DB 표본 원문에는 importer의 두 반복 write가 계속 잡혔다.

```text
INSERT INTO staging.ecount_partner_raw ...
UPDATE staging.ecount_partner_raw SET transform_status ...
```

구간 해석:

- 업로드 준비: 파일 선택부터 실제 POST까지 1,036ms.
- gateway 전달·초기 decode/header parse의 상한: POST부터 첫 DB 관측까지 269ms.
- DB write loop의 직접 관측 구간: 1,600ms. 측정된 요청 처리에서 가장 큰 구간이다.
- 남은 DB write·최종 count·응답 조립을 합친 상한: 543ms. 외부 표본만으로 그 내부를 더 쪼개지는 않았다.

`pg_stat_activity`를 외부 polling했으므로 첫/마지막 DB 경계에는 각 표본 주기 오차가 있다. 코드는 변경하지 않았다.

실 사용자는 10초 timeout 전에 HTTP 200과 적재 결과·보류 패널을 봤다. 무한 로딩·오류·부분 결과는 없었다. 실행 원문은 `1 passed (7.0s)`다.

- [05-performance-1000.json](../qa/2026-08-10-1154-r23/05-performance-1000.json)
- [06-performance-user-outcome.png](../qa/2026-08-10-1154-r23/06-performance-user-outcome.png)

## 8. cleanup 최종 잔여

정상 CSV 네 거래처와 혼합 인코딩의 읽힌 거래처는 사용자 DELETE API로 정리했다. DB 직접 DML은 하지 않았다. 대량 보류·혼합 인코딩 보류의 staging은 삭제 API가 없어 그대로 남는다.

```text
공유 partner_db
active 8309 · soft-deleted 11 · staging 19226
R23만: active 0 · soft-deleted 1 · staging 1404

격리 partner_r9
active 7261 · soft-deleted 2050 · staging 17766
R23만: active 0 · soft-deleted 4 · staging 4

R23 합계
active 0 · soft-deleted 5 · staging 1408
```

R23 staging 1,408은 화면 파일 201+201, 혼합 인코딩 2, 성능 1,000, 정상 CSV 4다. 같은 hash 재실행은 `(source_file_hash, source_row_no)` upsert라 중복 행을 늘리지 않았다.

## 9. 증거 무결성

- 첫 실행에서 `resolveQaShotsDir` 기본값이 만든 R23 `_local`을 발견했다. 동일 스펙을 `QA_SHOTS_DIR=.../docs/qa/2026-08-10-1154-r23`, `QA_ALLOW_OVERWRITE=1`로 다시 실행한 뒤 정확히 그 `_local`만 제거했다.
- 최종 `docs/qa/2026-08-10-1154-r23/**/_local`: **0개**.
- Playwright 디렉터리명은 `1154-r23-sol-reconvergence-real-qa`로 끝난다.
- `docs/qa` 캡처 경로 상수는 `resolveQaShotsDir(...)` 반환값 `shots` 하나만 사용한다.
- 모든 `writeFileSync`와 `page.screenshot` 목적지는 `shots`에서 파생된다.
- `resolveQaCredential`은 각 실 테스트 본문의 `try/catch` 안에서만 호출한다.
- 하네스 거짓 green 가드: **62/62 통과**. H-2 `docs/qa` 경로 상수 가드 포함.
- desktop typecheck: exit code 0. real-QA cleanup/scope 테스트도 통과.
- 보고서·JSON에 실제 자격 원문이 없다.

## 10. 신규 파일 목록

- `clients/desktop/playwright/1154-r23-sol-reconvergence-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1154-r23-sol-reconvergence-real-qa/1154-r23-sol-reconvergence.spec.ts`
- `docs/qa/2026-08-10-1154-r23/01-entry.png`
- `docs/qa/2026-08-10-1154-r23/01-live-panel.json`
- `docs/qa/2026-08-10-1154-r23/02-first-page.png`
- `docs/qa/2026-08-10-1154-r23/02-mock-isolation.json`
- `docs/qa/2026-08-10-1154-r23/03-last-page.png`
- `docs/qa/2026-08-10-1154-r23/03-mixed-encoding.json`
- `docs/qa/2026-08-10-1154-r23/04-master-and-normal-csv.json`
- `docs/qa/2026-08-10-1154-r23/04-second-file-reset.png`
- `docs/qa/2026-08-10-1154-r23/05-mixed-encoding.png`
- `docs/qa/2026-08-10-1154-r23/05-performance-1000.json`
- `docs/qa/2026-08-10-1154-r23/05b-mixed-readable-row.png`
- `docs/qa/2026-08-10-1154-r23/06-performance-user-outcome.png`
- `docs/dev-reports/2026-08-10-1154-r23-sol-reconvergence.md`

## 11. 못 한 것

- 실제 보류 패널의 `����` 표시 결함은 지시대로 고치지 않았다.
- 성능 코드는 수정하지 않았다.
- commit/push는 하지 않았다.
- `tools/legacy-gas/**`, 다른 워크트리, main은 변경하지 않았다.
