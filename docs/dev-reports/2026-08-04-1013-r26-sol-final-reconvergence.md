# PR #1059 R26 SOL 머지 전 재수렴 적대검증

- 대상: `feat/1013-dispatch-inherit` / 이슈 #1013
- 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 범위: R21 이후 fix가 건드린 표면 전체
- 상태: 검증 완료 — 도달 결함 1건, 증거 상태 불일치 1건

## 각도 1 — V93 양방향 접근 실데이터 전수

판정: **실 사용자 도달 결함 없음.** `auth_db`의 활성·enabled 계정 27명을 전수 집계했다. 새 표시 권한으로 추가 회복된 비-MASTER 계정은 `dev_manager`, `janyeonggu`, `dev_dispatch` **3명뿐**이다. 기존 시스템 MASTER 경로인 `dev_master`, `kimmiseon` 2명을 합치면 화면 접근 가능 계정은 5명이다. 나머지 비-MASTER **22명은 account/group/override 어느 활성 source에도 표시 권한이 없다.**

관측 원문:

```text
can_open=true
dev_dispatch   배차담당자  account=t group=t override=f
dev_manager    매니저      account=t group=t override=f
janyeonggu     매니저      account=t group=t override=f
dev_master     마스터      account=f group=t override=f is_master=t
kimmiseon      마스터      account=f group=t override=f is_master=t

can_open=false: dev_accountant 외 21명 = 합계 22명
전체 활성·enabled 27명 = 접근 5명 + 차단 22명

notification.dispatch-sms.send-audit 활성 source
role 0 / template 0 / group 0 / account 0 / override 0
```

V93이 account materialization에서 시스템 MASTER를 제외하는 조건도 실제로 유지되어 MASTER 2명의 account grant는 0이다. 두 계정은 기존 시스템 MASTER 및 마스터 group 경로로 접근하므로 V93이 잘못 추가로 연 비-MASTER 계정에 해당하지 않는다.

영향 건수: 신규 회복 3명, 기존 MASTER 접근 2명, 비대상 차단 22명, 과다 개방 0명, V92 회수 해제 0건.

## 각도 2 — R22 날짜 동기화와 반대 방향 혼입

판정: **실 사용자 도달 결함 없음.** 화면의 배차일 변경은 기존 연락처 행의 `date`만 새 날짜로 동기화하면서 입력한 전표번호·업체명·연락처는 보존한다. 서버는 요청일과 다른 `input.date`를 계속 제외한다.

실 런타임에서 `2026/08/03-1` 전표에 ASCII sentinel을 넣어 preview를 세 번 호출했다(무입력 / 날짜 일치 / 날짜 불일치). 날짜 일치 입력만 문구에 반영되고, 날짜 불일치 응답은 무입력 응답과 byte-level 문자열 비교상 동일했다.

관측 원문:

```text
EXACT_HTTP=200 TOTAL=6
EXACT_HAS_SENTINEL=True
EMPTY_EQUALS_EXACT=False

STALE_HTTP=200 TOTAL=6
STALE_HAS_SENTINEL=False
EMPTY_EQUALS_STALE=True

DispatchSmsPage.test.ts
Test Files 1 passed (1)
Tests      2 passed (2)
```

소스 경계도 다음과 같이 유지된다.

```text
DispatchSmsPage.handleDateChange:
  setDate(nextDate)
  setDriverContacts(rows => syncDriverContactDates(rows, nextDate))

DispatchBatchPreviewService.resolveDriverPhone:
  if (input.date() != null && !input.date().equals(requestedDate)) continue;
```

영향 건수: 실 재현일 `2026-08-03` 활성 OUTBOUND 6건에서 타 날짜 sentinel 혼입 0건. 일치 연락처 반영 1/1, 불일치 연락처 제외 1/1.

## 각도 3 — 공란 전표 fallback

판정: **실 사용자 도달 결함 없음.** `slip_db` 현재 실측은 활성 OUTBOUND 2,309건, 기사 연락처 공란 2,290건, 입력 19건으로 R21/R22 인용과 동일하다. 공란 6건이 존재하는 `2026-08-03`을 실 preview API로 호출했을 때 6건 전부 정확히 `기사번호 없음 확인요망!`으로 반환됐다.

관측 원문:

```text
active_outbound | blank_driver_phone | populated_driver_phone
2309            | 2290               | 19

2026-08-03 active_outbound=6 blank_driver_phone=6
PREVIEW_HTTP=200 TOTAL=6 UNMAPPED=6 EXACT_FALLBACK_ROWS=6 RECIPIENT_PHONE_NULL=6
```

영향 건수: 현재 fallback 모집단 2,290건. 실 런타임 표본 6/6 fallback 유지, 누락 0건.

## 각도 4 — 레거시 하차일별 문구·입력·수집 계승

문구 조립 판정: **조립 결과 자체는 실 런타임에서 레거시와 정확히 일치했다.** `2026/08/03-1`에 전체 전표번호로 연락처를 입력한 결과는 header, `3일 하차` section, `연락처 / 주소`, 미매핑 지연 안내의 값과 줄바꿈까지 레거시 예상 문자열과 exact match였다. 집중 composer/preview 테스트도 `BUILD SUCCESSFUL in 6s`였다.

```text
HTTP=200 TARGET_FOUND=true
HEADER=true
DAY_SECTION=true
DRIVER_LINE=true
UNMAPPED_NOTICE=true
LEGACY_EXPECTED_EXACT=true
```

### 결함 1

① 한 줄 요약: **레거시 배송기사 입력칸에서 사용하던 전표 순번(예: `1`)을 입력하면 현재 화면/API는 해당 전표를 찾지 못해 기사 연락처를 버리고 fallback을 표시한다.**

② 실 사용자 재현 절차:

1. MANAGER 또는 DISPATCH로 `/arologis/dispatch-sms`에 진입한다.
2. 배차일을 `2026-08-03`으로 선택한다.
3. `기사 연락처 행 추가`를 누른다.
4. 레거시 `업체명` 칸에서 허용되던 방식대로 `업체명/전표번호`에 전표 순번 `1`을 입력하고, 연락처에 `010-9999-8888`을 입력한다.
5. 미리보기를 누른다.
6. 실 전표 `2026/08/03-1` 문구에 입력 연락처가 들어가지 않고 `기사번호 없음 확인요망!`이 표시된다. 같은 절차에서 `1` 대신 전체 번호 `2026/08/03-1`을 입력하면 연락처가 반영된다.

③ 관측 원문:

```text
LEGACY_NUMERIC_HTTP=200 HAS_SENTINEL=false
GROUP_MESSAGE="기사번호 없음 확인요망!"
FULL_SLIP_HTTP=200 HAS_SENTINEL=true
```

레거시 원문은 입력 첫 열을 그대로 `업체명`으로 수집한다(`Index.html:421-424, 1351-1354`). 실제 매칭은 `Code.js:313-328`에서 `/` 구분 각 segment의 숫자·하이픈 뒤 번호·끝 1~3자리·숫자화 값을 `dispatch_number`와 비교하므로 `1`을 허용한다. 현재 `resolveDriverPhone`은 전체 `slipNo` exact, 입력값에 전체 `slipNo` 포함, 또는 `partnerName` exact만 허용해 순번 `1`을 거부한다.

④ 영향 건수: 실 재현일 공란 전표 **6/6건**이 `1`~`6` 레거시 순번 입력 대상이다. 현재 전체 공란 OUTBOUND **2,290/2,290건**의 `slip_no`가 `-숫자` suffix를 가지므로 동일 입력 방식의 잠재 영향 모집단이다.

## 각도 5 — 자동 SMS 부활 경로

판정: **실 사용자 도달 결함 없음.** 배차안내문자 제품 경로의 controller는 `/preview` 하나만 제공하며, FE 화면/API에 발송 함수·버튼·`/dispatch-batch/send` 호출이 없다. scheduler/listener에서 배차 batch를 발송하는 경로도 없다. 공용 SMS adapter와 다른 배차 도메인의 명시적 발송 기능은 이 화면의 자동 발송 경로가 아니다.

관측 원문:

```text
scopeADisplayOnly.contract.test.ts
Test Files 1 passed (1)
Tests      5 passed (5)

DispatchBatchAdminController
@PostMapping("/preview") 1개
dispatch-batch send controller/service/DTO 0개
DispatchSmsPage sendDispatchBatch 0개
dispatchSmsApi /admin/notifications/dispatch-batch/send 0개
history/mock SEND_AUDIT 생성 경로 0개
```

영향 건수: 배차안내문자 화면에서 자동 SMS 발송 사용자 경로 0개, preview 실호출 중 SMS 발송 0건.

## 증거 무결성

- R23 ③④ 연락처 반영, ⑤ fallback, ⑥ 편집·선택·복사, ⑦ 자동 SMS 부재, V92 회수 기록은 보고서 원문과 현재 소스/API/DB에서 재현됐다.
- R25 접근 회복 3/3, `dev_accountant` 차단, V92 회수 계정 distinct 25명, preview 200은 보고서·실 DB/API와 일치한다.
- R25 캡처 파일은 실제 11개다. `r25-dev-accountant-login.png`와 `r25-dev-accountant-blocked.png`는 동일 SHA-256이지만, 직접 확인한 화면은 ACCOUNTANT 대시보드이며 배차 메뉴 미노출 상태를 보여 준다. 파일 수 인용은 정확하다.
- **현재 CI 인용은 재현되지 않는다.** 검증 도중 PM이 R25 커밋 `20a6fd91e`를 HEAD에 추가해 새 CI가 시작됐다. `2026-08-04 00:27:43 +09:00` 실측은 총 42개 중 **41 SUCCESS / 1 IN_PROGRESS**이며 진행 중 항목은 `Desktop Playwright (mock 회귀 hard gate)`다. 따라서 현재 시점에는 `42/42 green`이 아니다.

## 이 라운드가 보지 않은 것

- `slip`·`accounting`은 다른 트랙 빌드이므로 해당 화면을 판정 근거로 사용하지 않았다.
- Docker build/up/restart 및 재배포, DB 변경, 실제 SMS 발송을 하지 않았다.
- 전체 652 Playwright와 전체 Gradle 스위트를 실행하지 않았다.
- 검증 품질, 문서 과장, 가드 강도, mock 충실도는 판정하지 않았다.

## 최종 판정

- 실 사용자 경로로 재현 가능한 결함: **1건** — 레거시 전표 순번 입력이 현재 연락처 매칭에서 탈락한다.
- 증거 무결성/상태 불일치: **1건** — 현재 CI는 42/42가 아니라 41/42이며 1개 진행 중이다.
- 머지 판단: **현재 머지 불가.** 위 도달 결함이 닫히고 새 HEAD CI가 전부 green이 된 뒤 재확인이 필요하다.
