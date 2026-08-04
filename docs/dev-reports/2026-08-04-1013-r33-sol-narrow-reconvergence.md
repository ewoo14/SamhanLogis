# PR #1059 R33 SOL 좁은 재수렴

- 대상: R27 `DispatchBatchPreviewService` 레거시 매칭 helper, R30 `DispatchSmsPage.tsx` `DriverContactsByDate`
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 시작 기준: `git pull` → `Already up to date.`
- 제한: 코드 수정·DB 쓰기·실 SMS·재배포·전체 회귀 없음

## 관측 기록

### 각도 1 — R27 helper와 레거시 `Code.js:313-328` 정밀 대조

- `Code.js`는 `/` 분할 각 segment에 대해 ① 첫 `-` 뒤 값 ② 순수 숫자 전체 ③ 끝 1~3자리 ④ 숫자만 추출 전체를 `dispatch_number`와 비교한다.
- R27 helper도 같은 순서·조건으로 ① `split("-")[1]` ② `^\\d+$` exact ③ 끝 1~3자리 ④ `\\D` 제거 전체를 비교한다.
- Java의 `dispatchNumber`는 현재 전표번호의 마지막 `-` 뒤 값이다. 레거시 `dispatch_number`는 배차 원문의 괄호에서 뽑은 1~3자리 순번이다. 실 DB의 전표번호 형식·leading zero·추가 하이픈 여부를 다음 각도에서 확인한다.
- 호출부의 전체 전표번호 포함·정확한 업체명 일치는 R27 이전부터 존재한 별도 경로다. 이번 helper 자체의 표면은 레거시 네 판정보다 정적으로 더 넓거나 더 좁지 않다.

관측 원문:

```text
Code.js:316  업체명.split('/')
Code.js:320  seg.split('-')[1] === dispatch_number
Code.js:321  /^\\d+$/.test(seg) && seg === dispatch_number
Code.js:322  /(\\d{1,3})$/[1] === dispatch_number
Code.js:323  seg.replace(/\\D/g, '') === dispatch_number

R27:249      companyName.split("/")
R27:256-257  hyphenParts[1].equals(dispatchNumber)
R27:259      ^\\d+$ exact
R27:252-254,260 끝 1~3자리 exact
R27:251,261 숫자만 추출 exact
```

### 각도 2 — 실 DB 순번 중복·숫자 업체명 오부착 후보 재산출

- `slip_db.slips`의 서비스 실제 조회 모집단(`is_deleted=false AND slip_type='OUTBOUND'`, `slip_date` 기준)을 `BEGIN READ ONLY`에서 집계했다.
- 활성 OUTBOUND 2,309건, `seq_no` 공란 0건, 비정규 전표번호 0건, 전표번호 suffix↔`seq_no` 불일치 0건, leading-zero suffix 0건이다.
- `(slip_date, seq_no)` 중복 그룹 조회는 결과 행 0개였다. 구현자의 `날짜별 seq_no 중복 0건`을 재현했다.
- 숫자가 섞인 실 업체명은 72행·52종·72일이다. 각 업체명을 `/`로 분할한 뒤 레거시 네 판정을 그대로 SQL로 적용해 같은 날짜의 다른 업체 전표와 조인한 결과, 교차 업체 오부착 후보는 pair 0·입력 업체명 0·대상 전표 0이었다.
- 영향 건수: 현재 실 DB에서 R27 순번 확장으로 오부착 가능한 전표 **0건**.

관측 원문:

```text
BEGIN
population|2309|2290|0|0|0|0
-- active_outbound|blank_driver_phone|blank_seq|noncanonical_slip_no|suffix_seq_mismatch|leading_zero_suffix

-- GROUP BY slip_date, seq_no HAVING count(*) > 1
결과 행 0

numeric_partner_names|72|52|72
numeric_company_cross_partner|0|0|0
-- candidate_pairs|input_names|target_slips
COMMIT
```

대표 숫자 업체명 원문:

```text
2026-07-15|2026/07/15-1|1|QA-793 라이브 테스트 거래처|all_digits=793
2026-05-31|2026/05/31-9|9|QA-Partner-P2002|all_digits=2002|suffix=002
2026-03-11|2026/03/11-1|1|거래처-P-2026-0020|all_digits=20260020|suffix=020
```

### 각도 3 — R30 날짜 왕복과 R32 증거 무결성

- 이번 세션의 in-app Browser 연결은 `No browser is available`, 브라우저 목록은 `[]`였다. 스킬의 복구 규칙상 독립 Playwright/다른 브라우저 제어로 우회하지 않았으므로, R32 사용자 경로를 새로 실행했다고 판정하지 않는다.
- R32가 사용한 A=`2026-08-03`은 활성 OUTBOUND 6건·`-1` 1건, B=`2026-07-27`은 66건·`-1` 1건으로 실 DB에서 그대로 재현됐다.
- R32 4개 단계 캡처는 모두 존재하고 서로 다른 B 단계 hash를 가진다. Step 1 A와 Step 4 A 복귀 파일은 SHA-256이 동일하다. 화면도 날짜 `2026-08-03`, 입력 `1 + 010-2026-0803`, `2026/08/03-1` 문구의 X가 동일해 “B 왕복 뒤 A가 원상복귀”라는 보고 내용과 모순되지 않는다.
- Step 2 B 캡처는 날짜 `2026-07-27`에서 연락처 입력행이 비어 있고, Step 3 B 캡처는 `1 + 010-2026-0727` 입력 및 `2026/07/27-1`의 Y를 담는다. 보고서의 X 미혼입/Y 반영 관측과 파일 내용이 일치한다.
- 영향 건수: 기존 R32 증거에서 데이터 소실·교차 혼입이 관측된 전표 **0건**. 단, 이번 라운드의 신규 UI 왕복 재현 건수는 브라우저 부재로 **0건**이다.

관측 원문:

```text
browser selection: No browser is available
agent.browsers.list(): []

r32_dates|2026-08-03|6|1|2026/08/03-1
r32_dates|2026-07-27|66|1|2026/07/27-1

r32-step1-A-1-X.png              2612999AD51397ADB68774C3B7D44414368BE92A7A05B92F07CF45EEE6F31206
r32-step2-B-no-X.png             1DAD4343C986B2A469529A29B66992FE06B5116B6B6C65D9800847FF3790078A
r32-step3-B-1-Y.png              71D655CFACE091F8731ADAE0FE8F1419E02E23B17643DE52BDDFBEE35A95A9A4
r32-step4-A-return-1-X-not-Y.png 2612999AD51397ADB68774C3B7D44414368BE92A7A05B92F07CF45EEE6F31206
```

## 결론

- 이번 라운드에서 확정한 실 사용자 도달 결함: **0건**.
- R27: 레거시 네 매칭과 같은 범위이며, 실 DB 중복·숫자 업체명 교차 오부착 영향 0건.
- R30: 기존 R32 증거와 실 DB 모집단은 일치하고 증거 무결성 결함은 없다. 다만 이번 라운드에서 신규 UI 왕복은 수행하지 못했다.

## 이 라운드가 보지 않은 것

- 브라우저 backend 부재로 소스 renderer에서 A→B→A→B→A를 새로 조작하는 실 사용자 경로.
- R27·R30 외 R26 표면, 전체 Playwright/Gradle, Docker 재배포, DB write, 실제 SMS.

**머지 가능 여부: SOL 최종 승인 보류 — 결함이 발견된 것은 아니지만, 요청된 R30 신규 실 사용자 왕복 재현이 이번 라운드에서 0건이다.**
