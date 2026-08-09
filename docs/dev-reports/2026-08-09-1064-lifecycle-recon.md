# #1064 입고 전표 lifecycle 정찰

- 조사일: 2026-08-09
- 측정 시각: **2026-08-09 01:26:52 KST**
- 대상: `fix/1064-inbound-lifecycle` HEAD `633f3289e`
- 원칙: 코드 수정 없음, DB `SELECT`만 수행, Docker 재배포 없음

## 0. 결론 — 최초 결함 설명은 현재 HEAD에서 사실이 아니다

현재 코드에는 “화면 버튼과 API 전이가 어긋나 GUI만으로 입고를 끝낼 수 없는” 구조적 결함이 없다.

- 입고 도메인 lifecycle 액션 합집합과 화면 액션 합집합은 각각 9개이며 **양방향 차집합이 0**이다.
- 입고 정상 경로는 화면에 `save → send → accept → process → complete → inspect → confirm` 전부 존재한다.
- `INSPECTING`의 분기 액션 `reject`도 화면에 존재한다. 하단의 정상 전이 버튼 하나만 세면 이를 놓치므로, 반려 사유 카드·모바일 더보기를 포함한 화면 전체를 셌다.
- `PROCESSING`의 공용 `complete` 라벨이 입고 화면에서 `출고 완료`로 보이던 회귀도 현재는 `mode`에 따라 `입고 완료/출고 완료`로 분리돼 있다(`clients/desktop/src/renderer/routes/SlipDetailPage.tsx:346-359`). 이 수정은 이미 머지된 `a8e3ede37`(PR #1066, 2026-08-07)에 들어갔다.
- 핸드오프도 `#1064`를 중복 트랙이며 `#1057`이 이미 고쳤다고 기록한다(`docs/handoff/CURRENT-WORK.md:548`). 현재 브랜치의 main 대비 커밋은 트랙 개설 문서 1개뿐이며 lifecycle 코드는 바꾸지 않았다.

다만 더 좋은 판정 축은 단순 두 집합이 아니라 다음 3층이다.

```text
① 도메인이 상태·유형·sourceType상 허용하는 액션
② 화면이 선언·노출하는 액션
③ 현재 역할 권한까지 적용했을 때 실제 클릭 가능한 액션
```

①↔② 차집합은 0이다. ③에서만 역할 차이가 있다. `MASTER`와 `WAREHOUSE`는 정상 입고 경로를 끝까지 실행할 수 있지만, `MANAGER`는 정책상 `inbound.inspection:UPDATE=false`라 `INSPECTING → COMPLETED`에서 차단된다. 이것이 결함인지 의도된 업무분장인지는 개발책임자 판단이 필요하다.

## 1. 도메인 상태 전이 그래프 전수

상태 enum은 `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipStatus.java:17-29`, 전이 강제의 정본은 `Slip` 도메인 메서드다.

| 현재 상태 | 액션 | 결과 | 적용 유형/조건 | 근거 |
|---|---|---|---|---|
| `DRAFT` | `save` | `SAVED` | 공통 | `Slip.java:1091-1099` |
| `DRAFT` | `cancel` | `CANCELED` | 공통 | `Slip.java:1272-1298` |
| `SAVED` | `send` | `SENT` | 거래처 필수 | `Slip.java:1101-1115` |
| `SAVED` | `cancel` | `CANCELED` | 공통 | `Slip.java:1272-1298` |
| `SENT` | `accept` | `ACCEPTED` | 공통 | `Slip.java:1133-1150` |
| `SENT` | `reject` | `REJECTED` | 공통 | `Slip.java:1244-1270` |
| `SENT` | `cancel` | `CANCELED` | `PARTNER_ORDER`는 금지 | `Slip.java:1272-1298` |
| `ACCEPTED` | `process` | `PROCESSING` | 공통 | `Slip.java:1152-1161` |
| `ACCEPTED` | `reject` | `REJECTED` | 공통 | `Slip.java:1244-1270` |
| `PROCESSING` | `complete` | `INSPECTING` | 공통 | `Slip.java:1163-1175` |
| `INSPECTING` | `inspect` | `COMPLETED` | 공통 | `Slip.java:1177-1196` |
| `INSPECTING` | `reject` | `REJECTED` | 공통 | `Slip.java:1244-1270` |
| `COMPLETED` | `confirm` | `CONFIRMED` | **INBOUND** | `Slip.java:1228-1242` |
| `COMPLETED` | `ship` | `SHIPPING` | **OUTBOUND only** | `Slip.java:1198-1211` |
| `SHIPPING` | `deliver` | `DELIVERED` | **OUTBOUND only** | `Slip.java:1213-1226` |
| `DELIVERED` | `confirm` | `CONFIRMED` | **OUTBOUND** | `Slip.java:1228-1242` |
| `CONFIRMED`/`REJECTED`/`CANCELED` | 없음 | terminal | 공통 | 각 메서드의 `requireStatus`; `Slip.java:1091-1298` |

정상 경로:

```text
INBOUND
DRAFT --save--> SAVED --send--> SENT --accept--> ACCEPTED
 --process--> PROCESSING --complete--> INSPECTING --inspect--> COMPLETED
 --confirm--> CONFIRMED

OUTBOUND
DRAFT --save--> SAVED --send--> SENT --accept--> ACCEPTED
 --process--> PROCESSING --complete--> INSPECTING --inspect--> COMPLETED
 --ship--> SHIPPING --deliver--> DELIVERED --confirm--> CONFIRMED
```

API도 같은 suffix 11개를 모두 제공한다: `save/send`는 `SlipController.java:459-489`, `accept/process`는 `:491-511`, `inspect/complete`는 `:513-552`, `ship/deliver/confirm`은 `:554-590`, `reject/cancel`은 `:592-624`. 프런트 호출은 `/slips/{id}/{action}` 1:1 계약이다(`clients/desktop/src/renderer/api/slip.ts:984-1013`). 단, 같은 파일의 설명 `:976-977`은 `inspect`와 `complete`의 출발 상태를 서로 뒤집어 적은 **주석 결함**이며 런타임 동작에는 영향이 없다.

## 2. 도메인 액션 전수 ↔ 화면 액션 전수

### 2.1 집합을 먼저 센 결과

| 유형 | 도메인 허용 액션 합집합 | 화면 노출 액션 합집합 | 도메인−화면 | 화면−도메인 |
|---|---|---|---|---|
| INBOUND | `{save, send, accept, process, complete, inspect, confirm, reject, cancel}` | 동일 9개 | `∅` | `∅` |
| OUTBOUND | 위 9개 + `{ship, deliver}` | 동일 11개 | `∅` | `∅` |

### 2.2 화면 전수

화면 정본은 `actionsForStatus()` (`clients/desktop/src/renderer/routes/SlipDetailPage.tsx:282-315`)이다.

| 상태 | INBOUND 화면 액션 | OUTBOUND 화면 액션 | 도메인과 대조 |
|---|---|---|---|
| `DRAFT` | `save`, `cancel` | 동일 | 일치 |
| `SAVED` | `send`, `cancel` | 동일 | 일치 |
| `SENT` | `accept`, `reject`, `cancel` | 동일 | 일치; `PARTNER_ORDER`는 화면·도메인 모두 cancel 금지 |
| `ACCEPTED` | `process`, `reject` | 동일 | 일치 |
| `PROCESSING` | `complete` | 동일 | 일치 |
| `INSPECTING` | `inspect`, `reject` | 동일 | 일치; 반려 소실 없음 |
| `COMPLETED` | `confirm` | `ship` | 일치 |
| `SHIPPING` | 없음 | `deliver` | 일치 |
| `DELIVERED` | 없음 | `confirm` | 일치 |
| terminal | 없음 | 없음 | 일치 |

노출 위치도 전부 확인했다.

- 정상 전이: `nextPrimaryAction`으로 선택(`SlipDetailPage.tsx:2563-2572`), 모바일 primary(`:2652-2659`), 데스크톱 footer(`:4935-4952`).
- `reject`: 모바일 더보기(`:3924-3935`)와 반려 사유 카드(`:4823-4857`).
- `cancel`: 모바일 더보기(`:3937-3948`)와 데스크톱 footer(`:4905-4921`).
- 런타임 endpoint suffix: `transitionSlip()` (`clients/desktop/src/renderer/api/slip.ts:1004-1013`).

### 2.3 권한까지 적용한 실행 가능 집합

화면 권한 표는 `SlipDetailPage.tsx:1252-1282`, 서버 권한은 `SlipController.java:465-623`이다. 특히 INBOUND `inspect`는 `slip.transfer.process:UPDATE`와 `inbound.inspection:UPDATE`를 **둘 다** 요구한다(`SlipDetailPage.tsx:1272-1275`, `SlipController.java:529-539`).

실 `auth_db` 조회 결과:

| 역할 | 입고 정상 경로 완료 | 막히는 곳 | 현재 권한 근거 |
|---|---|---|---|
| `MASTER` | 가능 | 없음 | 네 관련 page 모두 UPDATE=true |
| `WAREHOUSE` | 가능 | 없음 | `purchases.slip.edit`, `slip.transfer.process`, `inbound.inspection` UPDATE=true |
| `MANAGER` | 불가 | `inspect` | `inbound.inspection` VIEW=true, UPDATE=false |
| `INVENTORY` | 단독 전 과정 불가 | 생성/저장/확정 | 검사·처리는 가능하나 `purchases.slip.edit` UPDATE=false |

역할 seed도 같은 정책이다: `inbound.inspection`은 MASTER/WAREHOUSE/INVENTORY 편집, MANAGER 조회만 허용(`services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:65-91`, `:121-161`); 물류 처리는 MASTER/MANAGER/WAREHOUSE/INVENTORY 편집 허용(`V36__seed_sp_d6_6_slip_page_codes.sql:83-87`). 계정별 override는 관련 dev 계정 0건이었다.

## 3. 실 데이터 상태별 건수

조회 SQL:

```sql
SELECT slip_type, status, COUNT(*)
FROM slips
WHERE is_deleted = false
GROUP BY slip_type, status
ORDER BY slip_type, status;
```

측정 시각 **2026-08-09 01:26:52 KST**, soft-delete 제외.

| 상태 | INBOUND | OUTBOUND |
|---|---:|---:|
| `DRAFT` | 16 | 262 |
| `SAVED` | 4 | 15 |
| `SENT` | 2 | 15 |
| `ACCEPTED` | 6 | 6 |
| `PROCESSING` | 7 | 6 |
| `INSPECTING` | 2 | 7 |
| `COMPLETED` | 17 | 10 |
| `SHIPPING` | 0 | 5 |
| `DELIVERED` | 0 | 10 |
| `CONFIRMED` | 1 | 8 |
| `REJECTED` | 2 | 3 |
| `CANCELED` | 4 | 51 |
| **합계** | **61** | **398** |

입고 활성 비종결은 54건(`DRAFT 16`, `SAVED 4`, `SENT 2`, `ACCEPTED 6`, `PROCESSING 7`, `INSPECTING 2`, `COMPLETED 17`)이다. 표본 0이 아니므로 상태별 경로는 판정 가능하다.

### 막힌 전표 판정

- **구조적 dead-end: 0건.** 모든 활성 상태에서 정상 역할 조합으로 `CONFIRMED`까지 경로가 있다.
- **모든 사용자에게 막힌 전표: 확인되지 않음.** `MASTER`/`WAREHOUSE`는 경로를 실행할 수 있다.
- **MANAGER로만 보면 현재 `INSPECTING` 2건은 막힌다.** 두 건 모두 2026-08-08 생성, 거래처명 `S20 QA`, 메모 `S20-1123-*`인 QA 잔재다. 업무상 MANAGER가 검수 완료자여야 하는지는 미판정이다.
- `COMPLETED` 17건은 현재 화면에 `confirm`이 있으므로 이 결함으로 막힌 건이 아니다.
- 커밋 상태의 partnerless 행은 0건이다. partnerless는 INBOUND `DRAFT 1`, `SAVED 1`뿐이며 `send` 도메인 가드가 막아 정상이다.

공유 DB 오염 구분:

- INBOUND 61건 중 `created_by='system'`인 30건은 메모에 `[Stage 2 시드]`가 박힌 표준 시드다.
- 나머지 31건은 `#937`, `QA-874`, `S8/S20/S24/S26/S28-1123` 식별자가 메모·거래처명에 있어 QA 잔재로 판정했다.
- 따라서 현재 DB에서 **실 운영 입고 전표가 lifecycle 때문에 막혔다고 볼 표본은 0건**이다. 이는 “결함 0”이 아니라, 이 DB의 모집단이 시드/QA뿐이라는 뜻이다.

선행 실 GUI 증거는 존재한다. `dev_inventory`가 `/warehouse/inbound-inspections`에서 실제 INBOUND `INSPECTING → COMPLETED`를 200으로 수행했다(`docs/dev-reports/2026-08-07-1065-r11-live-qa.md:96-100`, `:114-127`). 이번 정찰은 DB 쓰기 금지 때문에 같은 전이를 재실행하지 않았다.

## 4. 출고와의 대조

입고만 화면 액션이 빠진 상태가 아니다. 두 유형 모두 도메인↔화면 차집합은 0이다.

| 축 | INBOUND | OUTBOUND |
|---|---|---|
| 공통 전반 | `save→send→accept→process→complete→inspect` | 동일 |
| `COMPLETED` 이후 | `confirm` 1회 | `ship→deliver→confirm` 3회 |
| 분기 액션 | `reject`, `cancel` | 동일 |
| 유형 금지 | `ship`, `deliver` | 해당 없음 |
| 화면/도메인 차집합 | 0 / 0 | 0 / 0 |
| 역할상 특수점 | INBOUND inspect는 `inbound.inspection` 추가 권한 | OUTBOUND inspect/후속은 결재선 capability 또는 정적 권한 |

출고도 기존 테스트가 전체 도메인 경로를 고정한다(`services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipDomainTest.java:186-206`). 입고는 배송 단계를 건너뛰고 확정되며(`:208-237`), 컨트롤러 IT도 입고 `complete→inspect→confirm`과 `ship=409`를 고정한다(`services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipLifecycleControllerIT.java:209-253`).

## 5. 다음 라운드 RED-A / RED-B 초안

### RED-A — 정상 경로

> `MASTER` 또는 업무상 입고 완료 책임 역할로 로그인해 입고 전표를 GUI에서 `DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED → CONFIRMED`까지 진행할 수 있고, 각 버튼이 호출한 endpoint와 도착 상태가 일치한다. `INSPECTING`에서는 정상 전이뿐 아니라 `반려`도 함께 노출된다.

현재 기존 테스트 중 재사용/확장할 것:

- 화면 상태·유형 액션: `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts:28-55`, `:263-365`.
- INBOUND API happy path와 금지 `ship`: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipLifecycleControllerIT.java:209-253`.
- 도메인 INBOUND happy path와 금지 `ship`: `services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipDomainTest.java:208-237`.

보강점: 현재 FE 테스트는 함수 단위라 실제 footer/반려 카드 렌더와 endpoint 호출을 한 시나리오로 관통하지 않는다. mock GUI E2E로 각 버튼의 요청 suffix와 도착 status를 순서대로 고정하는 것이 RED-A의 강한 형태다.

### RED-B — 금지 전이 보존

> 같은 GUI/API에서 상태·유형·sourceType·권한상 금지된 액션은 노출 또는 실행되지 않는다. 특히 INBOUND의 `ship/deliver`, `PROCESSING`의 `inspect`, `INSPECTING`의 `cancel`, `PARTNER_ORDER SENT`의 `cancel`, `inbound.inspection:UPDATE` 없는 역할의 `inspect`는 열리지 않는다.

**고치면 안 되는 기존 테스트**:

- `PROCESSING → inspect`는 CONFLICT: `SlipDomainTest.java:383-396`.
- `ACCEPTED → complete`는 CONFLICT: `SlipDomainTest.java:411-421`.
- `INSPECTING → cancel`은 CONFLICT: `SlipDomainTest.java:457-469`.
- INBOUND `ship`은 CONFLICT: `SlipDomainTest.java:224-237`, `SlipLifecycleControllerIT.java:242-253`.
- 잘못된 상태의 inspect는 409: `SlipInspectControllerIT.java:278-295`.
- MANAGER의 INBOUND inspect는 권한상 false이고 OUTBOUND 결재선 capability가 INBOUND로 새지 않음: `SlipDetailPage.lifecycle-contract.test.ts:263-310`, 역할별 전수 행렬 `:313-365`.
- `PARTNER_ORDER SENT` cancel 미노출: `SlipDetailPage.lifecycle-contract.test.ts:68-74`.
- `INSPECTING`의 reject 보존: `SlipDetailPage.lifecycle-contract.test.ts:43-48`, 도메인 `SlipDomainTest.java:441-455`.

## 6. PM 슬라이스 제안

현재 사실만 따르면 lifecycle 구현 슬라이스는 필요 없다. PM이 아래에서 필요한 것만 자르면 된다.

### Slice 0 — 정찰 종료/이슈 정정

- 범위: 이 보고서와 이슈 설명만 정정.
- 이유: 액션 차집합 0, 기존 코드·테스트·선행 실 GUI 증거가 이미 정상 경로를 보유.

### Slice A — 공용 상세 화면 lifecycle 계약 강화

- 같은 파일/화면 묶음: `SlipDetailPage.tsx`, `SlipDetailPage.lifecycle-contract.test.ts`, 새 mock GUI E2E.
- 내용: INBOUND 전체 정상 버튼과 `reject/cancel` 분기 버튼을 한 화면 시나리오로 전수 고정; OUTBOUND 회귀 동시 고정.
- DB/서버 계약 변경 없음.

### Slice B — 라벨·문서 의미 정합화(업무 결정 후)

- 같은 계약 묶음: `SlipDetailPage.tsx` 라벨, `clients/desktop/src/renderer/api/slip.ts:969-982` 주석, lifecycle 문서/테스트.
- 결정 필요: `complete`가 `INSPECTING`에 도착할 때 “입고 완료”가 맞는지, 아니면 “입고 반영/검수 대기”가 맞는지.

### Slice C — MANAGER 권한 변경(업무 결정 후, 별도)

- 같은 권한 테이블 묶음: auth migration/role template, 권한 행렬 테스트, 관리자 권한 화면 실측.
- 조건: MANAGER가 입고 검수 완료 책임 역할이라는 결정이 있을 때만 `inbound.inspection:UPDATE`를 연다.
- RED-B: ACCOUNTANT/SALES 등 비검수 역할과 OUTBOUND 결재선 capability가 INBOUND로 새지 않음을 유지.

## 7. 개발책임자 판단 질문

1. **입고 `INSPECTING → COMPLETED`를 수행해야 하는 역할은 누구입니까?** 현재는 `MASTER`/`WAREHOUSE`/`INVENTORY`가 가능하고 `MANAGER`는 조회만 가능합니다. MANAGER도 완료해야 한다면 Slice C가 필요합니다.
2. **`PROCESSING → INSPECTING`의 업무 라벨을 `입고 완료`로 유지합니까?** 실제 도착 상태는 검수중입니다. (a) `입고 완료` 유지 / (b) `입고 반영·검수 대기`로 변경하고 다음 `inspect`를 `입고 완료(검수 완료)`로 표시. 업무 의미는 정찰에서 추론하지 않았습니다.

## 8. 검증 및 제약

- DB: `slip_db`, `auth_db`에 SELECT만 수행.
- Docker: `docker ps`, 컨테이너 내부 `psql SELECT`만 수행. 재기동/재배포 없음.
- 로컬 targeted Vitest를 시도했으나 `pretest`가 `electron-updater`, design-system `dist`, Electron main 산출물 부재로 exit 1 중단했다. 메시지 자체가 “코드 결함으로 해석하지 말라”고 명시한다. 허용 파일 외 산출물을 만들 수 없어 `npm ci`/build는 수행하지 않았다.
- 기존 머지 증거: PR #1066의 CI·실 GUI 기록과 현재 소스/테스트를 정적 대조했다.

## 9. 신규 파일

- `docs/dev-reports/2026-08-09-1064-lifecycle-recon.md`
