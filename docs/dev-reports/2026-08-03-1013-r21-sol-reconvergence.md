# PR #1059 R21 SOL 재수렴 적대검증

- 검증 대상: `feat/1013-dispatch-inherit`, 요청 HEAD `ff194ecad`
- 검증 질문: 실 사용자 경로로 재현 가능한 결함이 있는가
- 판정 제약: 현재 Docker 스택은 이 PR 빌드가 아니므로 런타임 화면·API는 근거에서 제외한다. 소스·마이그레이션·DB 읽기를 중심으로 검증하며, 배포가 필요한 실행 확인은 `배포 미반영으로 미판정`으로 남긴다.
- 시작 상태: `git pull` → `Already up to date.`

## 진행 기록

### 각도 1 — V93 양방향 접근 건수와 V92 회수 유지

판정: **실 사용자 도달 결함 없음. 인용 건수 재현됨.** 현재 `auth_db`는 V90까지만 적용되어 있어 V92/V93을 실행하지 않고, V93의 `SELECT` 조건을 현재 실 데이터에 그대로 적용해 대상 건수를 계산했다.

관측 원문:

```text
flyway_schema_history 최고: V90

권한그룹 실데이터
마스터       활성·enabled 2명
매니저       활성·enabled 2명
배차담당자   활성·enabled 1명

V93 account_page_permissions SELECT와 동일 조건
DISPATCH  1
MANAGER   2
합계      3

전체 활성·enabled 계정                  27
V93이 여는 비-MASTER 계정                3
시스템 MASTER가 아니며 V93이 열지 않는 계정 22
```

양방향 판정:

- 열려야 하는 비-MASTER 사용자: MANAGER 2명 + DISPATCH 1명 = **3명 전원 선택**된다. 누락 0명.
- 열리면 안 되는 비-MASTER 사용자: 나머지 **22명 전원 V93 account 권한 생성 대상에서 제외**된다. 과다 개방 0명.
- MASTER 2명은 `is_system_master=TRUE` 그룹 보유자라 V93의 account materialization에서 의도적으로 제외되며 시스템 마스터 경로를 유지한다.
- 메뉴(`AppLayout.tsx:603`), route(`routes/index.tsx:1026`), 화면 create 동작(`DispatchSmsPage.tsx:101`), preview/history controller가 모두 새 `notification.dispatch-sms.display`를 사용한다.

V92 회수 유지 원문:

```text
V90 실 DB의 send-audit 활성 source row
account_page_permissions        25
account_permission_overrides     0
group_page_permissions           9
role_page_permission_templates  11
role_page_permissions           11
```

V92는 위 다섯 테이블의 `notification.dispatch-sms.send-audit AND is_deleted=FALSE`를 모두 soft-delete한다. 현재 활성 source row 56건이 모두 V92 조건에 걸린다. V93 파일에는 `send-audit` INSERT/UPDATE가 없고 새 `display`만 다루므로, 순차 적용 뒤 기존 회수 대상 활성 행 예상치는 **0건**이다. 회수 해제 0건.

재현 경로: V92/V93이 배포된 뒤 MANAGER 또는 DISPATCH 활성 계정으로 로그인 → 배차안내문자 메뉴/route 접근 가능. SALES/WAREHOUSE/ACCOUNTANT/INVENTORY/DRIVER/STAFF/DEVELOPER 등 비대상 계정으로 같은 route 접근 → 표시 권한 없음. 실제 배포 런타임 확인은 **배포 미반영으로 미판정**이며 이 판정은 마이그레이션 SQL과 V90 실 DB 읽기 결과다.

영향 건수: 정상 회복 3명(MANAGER 2, DISPATCH 1), 비대상 미개방 22명, V92 회수 유지 source row 56건 → 활성 0건 예상.

### 각도 2 — 기사 연락처 공란 전표 회귀와 증거 무결성

판정: **공란 전표의 실 사용자 도달 결함은 소스 경로에서 없음. 다만 제시된 실데이터 인용은 현재 DB와 다르므로 증거 무결성 불일치를 보고한다.**

레거시 인용 원문은 정확히 재현됐다.

```text
Index.html:421  <h3>배송기사내역 입력</h3>
Index.html:423  <th>업체명</th><th>배송기사 연락처</th>
Index.html:1351~1354
  tbl-driver 각 행의 업체명(c1), 배송기사 연락처(c2)를 읽고
  {'업체명': c1, '배송기사 연락처': c2, '날짜': dv}를 driverList에 push
```

공란 경로 원문:

- `DispatchBatchPreviewRequest` compact constructor가 `driverContacts == null`을 빈 목록으로 바꾼다.
- `resolveDriverPhone`은 null 행과 공란 `driverPhone`을 건너뛰고 최종적으로 기존 `slip.driverPhone()`을 반환한다.
- `toGroupInput`과 `legacyDisplayLine`은 연락처가 없으면 `기사번호 없음 확인요망!`을 만든다. 예외를 던지거나 해당 전표를 제거하지 않는다.
- 집중 실행: `:services:notification-service:test --tests DispatchBatchPreviewServiceTest` → `BUILD SUCCESSFUL in 8s`.

실 DB 재집계 원문:

```text
active_outbound  blank_driver_phone  populated_driver_phone
2309             2290                19

2026-08-03 active_outbound 6, blank_driver_phone 6
```

제시된 `활성 OUTBOUND 2,307건 중 2,288건 공란`은 현재 읽기 결과와 각각 **2건 차이**다. 채워진 연락처는 양쪽 모두 19건이므로, 현재 DB에 연락처 공란 활성 OUTBOUND 2건이 추가된 모양과 일치한다. 인용 시점 스냅샷은 보존되어 있지 않아 과거 수치 자체의 당시 진위를 재구성하지는 않았다.

재현 경로: 기사 연락처를 입력하지 않은 채 배차일을 선택하고 미리보기 → 각 공란 전표는 하차일별 그룹 안에서 `기사번호 없음 확인요망!`으로 남는다. 이 PR 빌드의 실제 API/화면 실행은 **배포 미반영으로 미판정**이다.

영향 건수: 현재 활성 OUTBOUND 공란 **2,290/2,309건**이 fallback 대상이며, 현재 DB 기준 인용 불일치 **2건**.

### 각도 3 — 입력 연락처가 하차일별 그룹 문구에 들어가는가

정상 순서에서는 들어간다. 화면의 `handlePreview`가 `{date, driverContacts}`를 API에 보내고, 서버가 전표번호 또는 업체명으로 연락처를 찾은 뒤 `withDriverPhone`으로 `OutboundSlipDto`를 교체한다. 이 교체된 DTO가 `toGroupInput` → `legacyDisplayLine` → `DispatchMessageGroupComposer.compose`로 전달된다. 집중 테스트 관측 원문도 입력 연락처 `010-9999-8888 / 서울시 강남구 테헤란로` 포함 및 fallback 부재를 확인한다.

그러나 fix가 만든 숨은 날짜 상태 때문에 아래 실 사용자 결함이 재현된다.

#### 결함 1

① 한 줄 요약: **기사 연락처 행을 먼저 추가한 뒤 배차일을 바꾸면, 화면에 보이지 않는 이전 날짜가 행에 남아 새 날짜용으로 입력한 연락처를 서버가 무조건 버린다.**

② 실 사용자 재현 절차:

1. MANAGER 또는 DISPATCH로 `/arologis/dispatch-sms`에 진입한다.
2. 초기 배차일 `2026-08-03` 상태에서 `기사 연락처 행 추가`를 누른다. 이 순간 행 객체의 `date`가 `2026-08-03`으로 고정된다.
3. 배차일을 실데이터가 있는 `2026-08-01`로 변경한다.
4. 이미 보이는 행에 `2026-08-01` 전표의 전표번호/업체명과 기사 연락처를 입력한다. UI에는 행 날짜 필드가 없으므로 사용자는 이 행이 여전히 `2026-08-03` 소속임을 볼 수도 고칠 수도 없다.
5. `미리보기`를 누른다. 요청은 `date=2026-08-01`, 해당 행은 `date=2026-08-03`으로 전송된다.
6. 서버의 날짜 불일치 조건이 행을 건너뛰므로, DB `driver_phone`이 공란인 전표는 입력 번호 대신 `기사번호 없음 확인요망!`으로 조립된다.

③ 관측 원문:

```text
DispatchSmsPage.tsx:379  배차일 onChange → onDateChange(value)
DispatchSmsPage.tsx:272  onDateChange={setDate}
DispatchSmsPage.tsx:411  행 추가 → { slipNo:'', companyName:'', driverPhone:'', date }
DispatchSmsPage.tsx:168  previewDispatchBatch(date, driverContacts)

DispatchBatchPreviewService.resolveDriverPhone
if (input.date() != null && !input.date().equals(requestedDate)) continue;
```

배차일 변경은 `date` state만 바꾸며 기존 `driverContacts[].date`를 갱신·교체하지 않는다. 행 UI도 날짜를 렌더하지 않는다.

④ 영향 건수: 구체 재현일 `2026-08-01`의 활성 OUTBOUND **4/4건이 기사 연락처 공란**이며, 이 순서로 입력하면 대상 행 연락처가 100% 무시된다. 전체 잠재 대상은 현재 공란 OUTBOUND 2,290건이고, 정상 접근 사용자는 MANAGER 2명 + DISPATCH 1명(및 MASTER 2명)이다. 실제 배포 화면/API 실행은 **배포 미반영으로 미판정**이나, 요청 객체와 서버 필터의 결정적 소스 경로로 재현된다.

### 각도 4 — R20 스펙 갱신과 자동 SMS 부재 잠금

판정: **실 사용자 도달 결함 없음. 제품 계약 완화 없음.**

- R20은 세 Playwright 파일에서 stale `notification.dispatch-sms.send-audit` 문자열을 실제 제품의 `notification.dispatch-sms.display`로 교체했을 뿐, 버튼 disabled/enabled 단언, AppLayout 동적 권한 단언, history DB/API 계약 단언을 삭제하거나 완화하지 않았다.
- `scopeADisplayOnly.contract.test.ts`는 살아 있으며 5개 계약을 그대로 실행한다. R19 diff는 그 파일의 공통 page-code 상수 한 줄만 `display`로 바꿨다.
- 집중 실행 원문: `Test Files 1 passed`, `Tests 5 passed`.
- 자동 SMS 부재 단언은 화면의 `sendDispatchBatch`/발송 버튼 부재, API의 `/admin/notifications/dispatch-batch/send` 부재, history/mock의 `SEND_AUDIT` 및 `/send-audit` 부재를 계속 고정한다.
- 실행 코드 검색에서도 배차 SMS 제품 경로는 `POST /admin/notifications/dispatch-batch/preview`만 확인됐고 `sendDispatchBatch`, `DispatchBatchSendService/Request/Response`, `/dispatch-batch/send`는 0건이다. 저장내역의 `AUTO_LATEST`/`MANUAL_NAMED`는 표시 결과 저장이지 SMS 발송이 아니다.

재현 경로: 배차안내문자 화면에서 가능한 제품 동작은 미리보기, 편집, 선택 복사, 저장내역 저장/복원이며 자동 SMS 발송 버튼·호출 경로가 없다. 이 PR 빌드의 실제 화면 실행은 **배포 미반영으로 미판정**이다.

영향 건수: 자동 SMS 발송 사용자 경로 **0개**, R20에서 완화된 제품 단언 **0개**.

## 증거 무결성

- 요청 HEAD `ff194ecad`와 실제 HEAD `ff194ecad9a0721035468c29686c25cda29965be` 일치.
- R19 `60ad211b2`, R20 `ff194ecad` 커밋 및 설명 일치.
- 레거시 `Index.html:421-424`, `Index.html:1351-1354` 인용 정확.
- MANAGER 2명, DISPATCH 1명 회복 인용은 V90 실 DB에 V93 선택 조건을 적용한 결과와 일치.
- `활성 OUTBOUND 2,307건 중 2,288건 공란`은 현재 DB의 `2,309건 중 2,290건 공란`과 불일치(각 2건 차이).

## 최종 판정

- 실 사용자 경로로 재현 가능한 결함: **1건**.
- 결함: 연락처 행 추가 후 배차일 변경 시 숨은 이전 날짜 때문에 입력 연락처가 서버에서 무시됨.
- 별도 증거 무결성 불일치: **1건** — 활성 OUTBOUND/공란 건수가 제시값보다 각각 2건 많음.

## 이 라운드가 보지 않은 것

- 현재 Docker의 auth/notification은 V91~V93 및 이 PR 제품 코드가 배포되지 않아 실제 화면/API 런타임은 판정하지 않았다.
- Docker build/up/restart 및 재배포를 하지 않았다.
- 전체 652 Playwright와 전체 Gradle 스위트를 실행하지 않았다.
- 검증 품질, 테스트 강도, 문서 표현, mock 충실도, 가드 구멍은 조사·판정 범위에서 제외했다.
