# PR #1106 (#1074) 적대적 검증 및 라이브 QA

## 환경 확인

- 검증 시각: 2026-08-08 05:03~05:16 KST
- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\t1074`
- 브랜치/HEAD: `fix/1074-outbound-cutoff-next-day` / `fc155e2d80ae14ef747b248a6ed819a2ab89d773`
- 실 GUI: `clients/desktop`을 cwd로 두고 branch renderer를 `http://127.0.0.1:5175`에 기동, Playwright Chromium headless로 클릭했다. mock은 사용하지 않았고 실 gateway `http://127.0.0.1:8080`과 실 JWT를 사용했다.
- Docker: 검증 전후 running 24개. `samhan-slip-service`와 `samhan-partner-order-service`는 healthy, `samhan-nginx` unhealthy는 선재 상태 그대로였다. 공유 stack은 재기동·재빌드하지 않았다.
- DB: `slip_db`에 대해 `SELECT`만 실행했다. cutoff 행의 삭제·비활성화·시각 변경 및 DB 직접 INSERT/UPDATE/DELETE는 하지 않았다.
- 배포 판정: 이번 production BE 변경은 없고 현재 slip-service에서 기존 cutoff 계약이 실동작했다. 추가 backend 배포는 필요하지 않았다.
- 계정/표기: 실 로그인 역할은 `MANAGER` 풀네임이었다. 비밀번호는 기존 QA 자격증명을 런타임에서만 읽었고 산출물에는 `<redacted>`로 취급했다.

## 결론

**결함 1건(P1)으로 머지 비권고**다.

- A PASS: 마감 후 DAY 익일 출고가 실 GUI `POST /slips` HTTP 201로 생성됐다.
- B PASS: 현재 마감 전인 활성 4태그를 실 GUI에서 두 차례씩 총 8건 정상 생성했고 8/8 HTTP 201, 오차단 **0건**이었다.
- C PASS: 현재 마감 후인 DAY 당일 출고는 HTTP 409와 “익일 출고로 생성하세요” 안내로 계속 차단됐다.
- D PASS(증거 혼합): DB/GUI 활성 행은 6개 전부이며, 현재 시각에 실제로 발화 가능한 축은 라이브 GUI로, 아직 발화하지 않은 시각 축은 fixed-clock BE 전수 테스트로 확인했다.
- P1 FAIL: `min=today`는 native validity의 `rangeUnderflow`만 만들 뿐 커스텀 저장 버튼을 막지 않는다. 과거 M을 입력한 신규 전표가 실제 HTTP 201로 저장됐다.

## 발화 조건 선계수

시나리오 실행 전에 실 DB와 KST 시각을 먼저 셌다.

| 조건 | 선계수 | 판정 가능성 |
|---|---:|---|
| 활성 cutoff 행 | 6 | D 전수 판정 가능 |
| 현재 시각(05시대)보다 cutoff가 지난 태그 | 2 (`DAY`, `LOGEN`) | A/C 라이브 판정 가능 |
| 현재 시각보다 cutoff가 남은 태그 | 4 (`REGION`, `STACK`, `GYEONGDONG_PARCEL`, `GYEONGDONG_FREIGHT`) | B 라이브 판정 가능 |
| 실행 전 2026-08-08 OUTBOUND 저장 행 | 0 | 이번 라운드 생성분을 분리 가능 |
| 실행 전 당일 활성 cutoff 태그 저장 행 | 0 | B 저장 결과를 분리 가능 |
| 과거 OUTBOUND DRAFT/SAVED 수정 후보 | 210 | 기존 과거 전표 수정 축 판정 가능 |
| 전체 과거/현재 활성 cutoff 태그 OUTBOUND 저장 행 | 62 | 실데이터 표본 존재 |

발화 조건이 0인 축은 라이브 PASS로 세지 않았다. 아래 6태그 표에서 `판정 불가`로 명시한다.

## A/B/C/D 라이브 결과

### A — 안내대로 익일 출고 생성

- 발화 조건: 현재 마감 후 태그 2개.
- 실 GUI 실행: DAY, M=`2026-08-09`.
- 결과: HTTP **201**, 전표번호 `2026/08/09-2`(동일 orphan 실행분 `2026/08/09-1`도 사후 SELECT에서 확인).
- 화면 증거: `05-a-day-next-day-created.png`.

안내가 제시하는 익일 경로를 실제 사용자가 따라갈 수 있다.

### B — 마감 전 정상 생성 오차단

- 발화 조건: 현재 마감 전 태그 4개.
- 실 GUI 실행: 4태그 × 2회 = 정상 경로 **8건**.
- 결과: HTTP 201 **8/8**, 이번 변경에 의한 오차단 **0건**.
- 저장 확인: `2026/08/08-1`~`2026/08/08-8`; 태그별 2건씩 `REGION`, `STACK`, `GYEONGDONG_PARCEL`, `GYEONGDONG_FREIGHT`.
- 화면 증거: `06-b-region-created.png`~`09-b-gyeongdong_freight-created.png`.

실데이터 기반 정상 시도에서 막힌 건수는 0이다. 실행 전 기준선도 0이었다.

### C — 마감 후 당일 출고 차단 유지

- 발화 조건: 현재 마감 후 태그 2개.
- 실 GUI 실행: DAY, M=`2026-08-08`.
- 결과: HTTP **409**, `당일 당일 마감(00:01) 초과 — 익일 출고로 생성하세요`.
- 저장 행: 없음.
- 화면 증거: `04-c-day-same-day-blocked.png`.

당일 마감 규칙은 뚫리지 않았다. 다만 메시지의 `당일 당일 마감` 중복 표현은 기존 tag label과 문장 조합에서 온 것으로 이번 변경의 신규 회귀는 아니다.

### D — 활성 마감 태그 6개 전수

| 태그 | DB cutoff | 현재 phase | 마감 전 당일 | 마감 후 당일 | 마감 후 익일 |
|---|---:|---|---|---|---|
| `DAY` | 00:01 | AFTER | 라이브 발화 0 → 판정 불가 / fixed-clock PASS | 라이브 409 PASS | 라이브 201 PASS |
| `LOGEN` | 00:01 | AFTER | 라이브 발화 0 → 판정 불가 / fixed-clock PASS | 이번 GUI 미실시 / fixed-clock PASS | 이번 GUI 미실시 / fixed-clock PASS |
| `REGION` | 12:00 | BEFORE | 라이브 201 2/2 PASS | 라이브 발화 0 → 판정 불가 / fixed-clock PASS | fixed-clock PASS |
| `STACK` | 14:00 | BEFORE | 라이브 201 2/2 PASS | 라이브 발화 0 → 판정 불가 / fixed-clock PASS | fixed-clock PASS |
| `GYEONGDONG_PARCEL` | 15:00 | BEFORE | 라이브 201 2/2 PASS | 라이브 발화 0 → 판정 불가 / fixed-clock PASS | fixed-clock PASS |
| `GYEONGDONG_FREIGHT` | 15:00 | BEFORE | 라이브 201 2/2 PASS | 라이브 발화 0 → 판정 불가 / fixed-clock PASS | fixed-clock PASS |

DB와 설정 GUI 모두 6개가 `active=true`, `is_deleted=false`였다. `00-environment-active-cutoffs.png`에 시드 4개뿐 아니라 DAY·LOGEN까지 한 화면에 캡처했다. 용어 기준은 배송주소 파싱이 아니라 `slips.delivery_tag`다.

## 결함

### P1 — 과거 출고일 신규 생성이 실제로 차단되지 않음

재현:

1. 새 판매전표에서 M에 `2026-08-07`을 키보드 입력한다.
2. 브라우저 validity는 `valid=false`, `rangeUnderflow=true`, `min=2026-08-08`이 된다.
3. 창고와 품목을 선택하면 저장 버튼은 활성 상태다.
4. 저장을 클릭하면 `POST /slips`가 HTTP **201**로 성공한다.

실 저장 증거는 `2026/08/07-41`, `2026/08/07-42` 두 건이며 모두 `LOGEN`, `DRAFT`, `is_deleted=false`다. `10-past-date-underflow-before-save.png`는 과거 M과 활성 저장 버튼, `11-past-date-save-result.png`는 저장 후 목록을 보여 준다.

원인은 두 층이 연결되지 않은 것이다.

- `SlipFormPage.tsx`의 date input은 `min={today}`만 둔다.
- 저장은 HTML form submit이 아니라 `Button onClick={() => mutation.mutate()}`다.
- `canSubmit`은 창고·유효 라인·비동기 상태만 보고 `slipDate >= today`를 검사하지 않는다.
- BE `OutboundCutoffGuard`는 오늘이 아닌 날짜(미래와 과거 모두)를 즉시 통과시킨다.
- 신규 테스트도 `min` 속성과 disabled 여부만 확인하고 과거 날짜 저장 클릭을 검증하지 않는다.

따라서 “달력에서 과거 날짜가 흐리게 보인다”와 “신규 과거 출고가 차단된다”는 같은 계약이 아니다. FE 저장 가드와 회귀 테스트가 필요하다.

## N(하차일) 재계산

실 GUI에서 REGION과 STACK을 각각 확인했다.

| 태그 | 자동 N | 사용자가 입력한 N | M 변경 후 N | 수동값 보존 |
|---|---|---|---|---|
| REGION | 2026-08-10 | 2026-08-14 | 2026-08-11 | 아니오 |
| STACK | 2026-08-09 | 2026-08-14 | 2026-08-10 | 아니오 |

사용자가 N을 고친 뒤 M을 바꾸면 수동 N은 즉시 새 계산값으로 덮어써진다. 이는 이번 요청에 명시된 “M 변경 시 N 자동 재계산”과 일치하므로 결함 수에는 넣지 않았다. 수동 N을 보존해야 한다는 별도 UX 계약이라면 dirty-state 추적이 현재 구현에는 없다. 증거는 `02-n-manual-before-m-change.png`, `03-n-after-m-change.png`, `16-stack-n-after-m-change.png`다.

## 과거 전표 수정과 비 OUTBOUND 회귀

### 기존 과거 전표 수정

- 발화 후보: 과거 OUTBOUND DRAFT/SAVED 210건.
- 이번 라운드가 만든 과거 QA 전표 `2026/08/07-42`의 상세 화면에서 직접 수정 UI가 열렸다.
- 출고일 자체는 수정 입력으로 노출되지 않았고, `min=today`가 상세 수정 화면에 전파되지 않았다.
- 변경 없이 저장한 실제 `PUT /slips/{id}/sales`는 HTTP **200**이었다.
- 화면 UUID 0, alert 0.
- 증거: `13-past-existing-detail.png`, `14-past-existing-edit-open.png`, `15-past-existing-edit-saved.png`.

즉 신규 과거일 차단 결함과 별개로, 기존 과거 전표 수정은 막히지 않았다.

### INBOUND

- 실 `/purchases/new`에서 `slip-form-outbound-date` 0개, cutoff tag select 0개, date input 0개였다.
- OUTBOUND에서만 M 선택 UI가 노출된다.
- 공용 `slipDate` state는 INBOUND에서도 이전과 같은 오늘 기본값으로 payload에 들어가므로 행위 변화가 없다.
- 증거: `12-inbound-unaffected.png`.

## 화면 노출·용어·권한

- 17개 캡처 시점의 body text 전수 정규식 검사: UUID **0건**.
- 사용자 화면의 금지 용어 `슬립`: **0건**. `판매전표`/`입고전표` 용어 사용.
- 로그인 역할 표기: `MANAGER` 풀네임 확인.
- 변경 diff에 신규 UUID/역할 약어/`슬립` 사용자 문구 없음.

## 자동 검증

| 검증 | 결과 |
|---|---|
| `npm run test -- src/renderer/routes/SlipFormPage.test.tsx` | 97/97 PASS, skipped 0 |
| `npm run typecheck` | exit 0; real-QA scope 단위 2 + 50 PASS |
| `gradlew ... OutboundCutoffGuardTest --rerun-tasks` | BUILD SUCCESSFUL, 18 tasks executed |
| fixed-clock cutoff matrix | 6태그 × (after today block + after tomorrow pass + before today pass) PASS |

자동 테스트는 현재 구현의 의도된 A/B/C/D를 통과하지만 P1 과거 입력 저장 경로를 포함하지 않아 false-green이다.

## 라이브 QA 데이터 부작용

첫 장시간 Playwright 드라이버에서 외부 명령 타임아웃이 먼저 발생했지만 자식 Node가 계속 실행됐다. 같은 드라이버를 다시 실행한 뒤 사후 SELECT에서 첫 실행도 완료됐음을 확인했다. 그 결과 정상 5건과 과거 bypass 1건이 각각 두 번 생성됐다.

- 정상 생성: `2026/08/09-1`, `2026/08/09-2`, `2026/08/08-1`~`2026/08/08-8` — 총 10건.
- 결함 재현: `2026/08/07-41`, `2026/08/07-42` — 총 2건.
- 전부 실 API를 통한 DRAFT 생성이며 DB 직접 DML이 아니다.
- 사용자 지시대로 DB DELETE/soft-delete 정리를 하지 않았다.
- 사후 프로세스 조회에서 QA Node/Chromium 잔존 0, 검증용 Vite만 식별됐다. 종료 절에서 Vite도 회수한다.

이 중 B 정상 경로는 8건 전부 성공했으므로 오차단 집계는 0으로 더 강해졌지만, 중복 생성 자체는 QA 하네스 부작용으로 투명하게 기록한다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1074-verification-and-live-qa.md`
- `docs/qa-shots/1074-live-qa/00-environment-active-cutoffs.png`
- `docs/qa-shots/1074-live-qa/01-outbound-default-date.png`
- `docs/qa-shots/1074-live-qa/02-n-manual-before-m-change.png`
- `docs/qa-shots/1074-live-qa/03-n-after-m-change.png`
- `docs/qa-shots/1074-live-qa/04-c-day-same-day-blocked.png`
- `docs/qa-shots/1074-live-qa/05-a-day-next-day-created.png`
- `docs/qa-shots/1074-live-qa/06-b-region-created.png`
- `docs/qa-shots/1074-live-qa/07-b-stack-created.png`
- `docs/qa-shots/1074-live-qa/08-b-gyeongdong_parcel-created.png`
- `docs/qa-shots/1074-live-qa/09-b-gyeongdong_freight-created.png`
- `docs/qa-shots/1074-live-qa/10-past-date-underflow-before-save.png`
- `docs/qa-shots/1074-live-qa/11-past-date-save-result.png`
- `docs/qa-shots/1074-live-qa/12-inbound-unaffected.png`
- `docs/qa-shots/1074-live-qa/13-past-existing-detail.png`
- `docs/qa-shots/1074-live-qa/14-past-existing-edit-open.png`
- `docs/qa-shots/1074-live-qa/15-past-existing-edit-saved.png`
- `docs/qa-shots/1074-live-qa/16-stack-n-after-m-change.png`

## 이 라운드가 보지 않은 것

- 실제 KST 12:00/14:00/15:00 이후까지 기다려 REGION·STACK·경동 2종의 당일 409를 라이브로 재현하지 않았다. 현재 발화 조건이 0이라 판정 불가로 남기고 fixed-clock 전수 테스트로만 보완했다.
- DAY·LOGEN의 00:01 이전 마감 전 당일 201은 현재 발화 조건이 0이라 라이브 판정하지 않았다.
- LOGEN의 마감 후 당일/익일 GUI를 별도로 클릭하지 않았다. DAY 실 GUI와 동일 BE 계약의 fixed-clock 전수 테스트로만 확인했다.
- 날짜 선택기의 OS별 캘린더 팝업 모양, 키보드·스크린리더별 접근성, Electron packaged binary는 보지 않았다.
- 상단의 기존 “업데이트 실패” 배너와 nginx unhealthy 원인은 본 PR 범위로 진단하지 않았다.
