# PR #1124 / Issue #1123 — S15 SOL 재수렴 적대검증

- 검증일: 2026-08-08 KST
- 작업 디렉터리: `C:\dev\Samhan-Public\.claude\worktrees\t1123`
- 검증 대상: 사용자 지정 브랜치 `feat/1123-closed-date-guard`, HEAD `edd7ef8b9`
- 제한 준수: 제품 코드 수정 없음, `git` 명령 없음, 컨테이너 재기동·재배포 없음, DB 직접 mutation 없음
- 실 mutation: gateway의 관리자 기준선 API와 사용자 전표 API만 사용했다. SQL은 SELECT만 사용했다.

## 결론

**BLOCK — 도달 결함 1건.**

신규 생성 7개 운영 경로에는 마감 가드가 연결돼 있다. 그러나 마감 전에 생성·soft-delete한 판매전표를 마감 후 복원하면 닫힌 날짜의 활성 전표가 200 OK로 되살아난다. 복원은 internal API가 아니라 실 JWT와 `sales.slip.list` RESTORE 권한을 받는 사용자 API다.

S14의 여섯 시나리오를 실제로 밟았다는 전제는 반증되지 않았다. `0 / 367 / 0`, 당일 경계, 제외한 404 표본을 다시 확인했고 보고서·코드·실 응답이 서로 맞았다.

## 결함 S15-1 — 마감된 날짜의 soft-delete 판매전표를 복원해 활성화할 수 있다

### 재현 절차

모든 조작은 `dev_manager` 실 로그인 JWT와 gateway `http://127.0.0.1:8080`을 사용했다.

1. 활성 기준선 0건에서 `OUTBOUND / 2026-08-08 / S15-1123-restore-closed-date-probe` 전표를 생성한다.
2. 상세 응답의 `updatedAt`으로 `DELETE /slips/{id}/sales`를 호출해 실 soft-delete한다.
3. `POST /admin/slip-closing-baselines`로 `OUTBOUND / 2026-08-09` 기준선을 활성화한다. 2026-08-08은 strict-before라 닫힌 날짜다.
4. `POST /api/v1/slips/{id}/restore`를 호출한다.
5. 읽기 전용 SQL로 같은 메모의 활성 행을 센다.

실측 원문(UUID 비공개):

```text
{"step":"create-probe-before-close","http":201,"slipNo":"2026/08/08-23"}
{"step":"delete-probe-before-close","http":200,"code":"OK"}
{"step":"activate-OUTBOUND-close","http":200}
{"step":"restore-while-date-closed","http":200,"code":"OK","message":"성공","slipNo":"2026/08/08-23"}
probe_active_after_restore=1
```

### 원인

- 사용자 endpoint와 권한: `SlipRestoreController.java:26-27` — `POST /slips/{id}/restore`, `sales.slip.list` RESTORE.
- 복원 구현: `SlipRestoreService.java:71,96-97` — 삭제행을 활성화하고 `saveAndFlush`한다.
- 이 서비스의 주입 필드는 repository·line repository·realtime publisher뿐이며 `SlipClosedDateGuard`가 없다(`SlipRestoreService.java:25-27`).
- 반면 신규 생성 판정은 `SlipClosedDateGuard.java:41-48`에만 있다.

### 왜 실 사용자가 밟는가

판매전표 목록은 삭제행을 복원하는 정식 서버 기능이고, 실 `dev_manager` 계정이 같은 gateway에서 RESTORE 권한으로 200에 도달했다. 사용자가 과거 전표를 잘못 삭제한 뒤 복원하는 것은 정상 조작이다. 관리자가 그 사이 기준선을 앞으로 옮기면, 사용자는 신규 생성 409를 받는 날짜에 삭제 전표는 복원할 수 있다. 복원된 행은 활성 목록·집계에 다시 참여하므로 단순 조회 문제가 아니다.

데스크톱 운영 소스에서 이 endpoint를 호출하는 전용 함수·버튼은 이번 grep에서 찾지 못했다. 따라서 현재 도달 증거는 GUI 클릭이 아니라 **실 사용자 JWT가 허용된 공개 gateway API**다. S14 역시 같은 방식으로 기능을 판정했다.

## 1. 전표 종류·복수 기준선

현재 지원 종류는 `OUTBOUND`, `INBOUND` 두 개뿐이다(`SlipType.java:12-14`).

### 종류 격리

```text
INBOUND 기준선 활성 + OUTBOUND 2026-08-08 생성
→ HTTP 201, 2026/08/08-22

INBOUND 기준선 활성 + INBOUND 2026-08-08 생성(dev_warehouse)
→ HTTP 409 CONFLICT
→ "마감된 날짜에는 신규 전표를 만들 수 없습니다."

OUTBOUND 기준선 활성 + INBOUND 2026-08-08 생성
→ HTTP 201, 2026/08/08-2
```

종류별 기준선은 다른 종류를 막지 않았다. 교차 오차단 `0/2`, 같은 종류 차단 `1/1`이다.

### 같은 종류 여러 기준선

`INBOUND / 2026-08-09` 생성 후 같은 종류를 `2026-08-10`으로 다시 POST한 결과:

```text
HTTP 409 CONFLICT
"이미 마감 기준선이 등록된 전표 종류입니다: INBOUND"
```

서비스도 활성 동일 종류를 먼저 조회해 거부한다(`SlipClosingBaselineAdminService.java:30-34`). DB에는 활성행에 한해 `slip_type` unique index가 있다(`V118__create_slip_closed_date_policy.sql:32-34`). 따라서 정상 API로 같은 종류의 겹침·역전 기준선 여러 건을 만들 수 없다. 날짜 변경은 기존 기준선을 DELETE한 뒤 새 기준선을 POST해야 한다.

## 2. 생성 이외의 조작

### 전표일 수정 우회

전표일은 생성자에서만 설정되고(`Slip.java:655-661`), 도메인 문서도 `slipDate`를 잠금·불변으로 선언한다(`Slip.java:232-234`). 매입·매출 PUT DTO와 header PATCH에는 `slipDate`가 없다. 따라서 열린 날짜 전표의 날짜를 닫힌 날짜로 바꾸는 사용자 mutation 경로는 찾지 못했다.

### 상태 전이

INBOUND 기준선 아래서 만든 OUTBOUND 전표를, 이후 OUTBOUND 기준선으로 닫은 뒤 저장 전이했다.

```text
POST /api/v1/slips/{id}/save
HTTP 200 OK
slipNo=2026/08/08-22, DRAFT → SAVED
```

기존 전표 상태 전이는 생성 가드를 보지 않는다. 이슈가 “신규 전표 생성 차단”이고 날짜를 바꾸지 않으므로 자체 결함으로 세지 않았다. 삭제도 마감 가드가 아니라 기존 상태·낙관적 잠금 규칙을 따른다. 다만 삭제 후 **복원**은 비활성 행을 다시 활성화하므로 S15-1로 분리했다.

## 3. 다른 생성 진입 경로 전수

`Slip.createOutbound/createInbound`, `slipRepository.save/saveAndFlush`, controller POST, `assertCreatable`을 교차 grep했다. 사용자 도달 생성 경로는 다음 7개이며 모두 가드 호출이 있다.

| 생성 경로 | 가드 위치 | 판정 |
|---|---|---|
| 직접 생성 `POST /api/v1/slips` | `SlipService.java:270` | 연결 |
| 서버측 복사 `POST /api/v1/slips/{id}/duplicate` | `SlipDuplicateService.java:90` | 연결, 실 409 재현 |
| 모바일 주문 `POST /mobile/sales/partner-orders` | `MobilePartnerOrderService.java:119` | 연결 |
| 견적 accept/convert 자동 생성 | `EstimateToSlipConverter.java:67-68` | 연결 |
| 견적 발행 `POST /api/v1/slips/from-estimate` | `SlipPublishService.java:140` | 연결 |
| 주문 발행 `.../from-partner-order` | `SlipPublishService.java:227` | 연결 |
| 주문 병합 발행 `.../from-orders-merge` | `SlipPublishService.java:331` | 연결 |

복사 실측 원문:

```text
POST /api/v1/slips/{id}/duplicate
HTTP 409 CONFLICT
"마감된 날짜에는 신규 전표를 만들 수 없습니다."
```

`SlipSeeder`, `DeliveryBatchSeeder`의 저장은 앱 기동 시드 경로로 사용자 runtime API가 아니어서 위 7개에서 제외했다. 견적 생성 자체는 전표가 아니며, 전표가 되는 convert/publish 경계를 별도로 셌다.

## 4. 권한 축

활성 계정과 materialize된 account 권한의 실 DB 집계:

```text
enabled=32 | exception_create=3 | admin_create=3

dev_manager          | 매니저 | exception=true | admin=true
janyeonggu           | 매니저 | exception=true | admin=true
manager@samhan.test  | 매니저 | exception=true | admin=true
```

예외 권한이 없는 `dev_sales`의 OUTBOUND 닫힌 날짜는 S14에서 409였고, 이번에는 예외 권한이 없으면서 INBOUND 작성 권한이 있는 `dev_warehouse`로 INBOUND 닫힌 날짜 409를 재현했다. 예외 권한이 있는 `dev_manager`의 통과는 S14 원문과 일치한다. 예외가 없는데 통과하거나, materialize된 예외 권한이 있는데 막힌 계정은 확인되지 않았다.

## 5. 정상 경로 오차단·367건·미래 기준선

S15 시작/종료 활성 기준선은 0건이다. 활성 전표 분포는 S14보다 QA 전표 4건이 늘어 총 399건이지만 과거 전표 수는 그대로다.

```text
active_total=399 | past=367 | past_out=325 | past_in=42
```

`OUTBOUND`와 `INBOUND`에 모두 `baselineDate=2026-08-09`를 활성화한 상태에서 기존 활성 전표가 닫힌 날짜에 속하는지만 세면:

```text
closed_by_both=389 | out=346 | in=43
```

389는 기존 행을 차단·변경한 수가 아니라 `slip_date < 2026-08-09`인 활성행의 날짜 분포다. 기존 행은 그대로 활성이고, 실제 상태 전이도 위에서 200이었다. 367과의 차이 22건은 `current_date=2026-08-08` 당일 행이다. 즉 “기존 367건 중 영향”은 다음처럼 구분해야 한다.

- 닫힌 날짜 집합에 들어가는 과거 기존 행: `367/367`.
- 이 PR의 create guard 때문에 기존 행 자체가 거부·삭제·변경된 수: `0/367`.
- 복원으로 다시 활성화할 수 있는 행: S15-1에서 `1/1` 실증.

미래 기준선은 해당 종류의 오늘과 모든 과거 날짜 신규 생성을 누적 차단한다. 이는 S14가 `익일 기준선으로 오늘을 닫는` 계약으로 이미 실증한 동작이다. 다만 가드는 `!slipDate.isAfter(LocalDate.now(clock))`도 함께 요구하므로 오늘보다 미래인 전표일을 미래 기준선이 선제 차단하지 않는다(`SlipClosedDateGuard.java:45-47`).

시간대는 `TimeConfig.java:18-20`의 `Clock.system(ZoneId.of("Asia/Seoul"))`로 고정된다. 날짜만 비교하므로 KST 하루 안에서는 결과가 뒤집히지 않고 KST 자정에 `today`가 바뀐다. 클라이언트 시간대는 요청의 ISO `LocalDate`를 바꾸지 않는 한 판정에 개입하지 않는다.

## 6. S14 증거 무결성 표본

### `0 / 367 / 0`

종료 후 재측정:

```text
active_baselines=0
active_past_slips=367
existing_active_slips_on_currently_closed_dates=0
```

따라서 PM/S14의 `0 / 367 / 0`은 지금도 일치한다. 총 활성 전표만 S14 QA 4건 때문에 `395 → 399`로 변했다.

### 기준일 당일

코드 원문은 `SlipClosedDateGuard.java:45-47`이다.

```java
.filter(baseline -> baseline.isEnabled()
        && slipDate.isBefore(baseline.getBaselineDate())
        && !slipDate.isAfter(LocalDate.now(clock)))
```

동일 날짜에는 `isBefore`가 false이므로 S14 시나리오 5의 “당일은 열린다”와 정확히 일치한다.

### S14 제외 404 표본

S14 보고서는 최초 product UUID를 비공개 처리해 동일 식별자를 그대로 재호출할 수는 없다. 대신 같은 기준선·계정·본문에서 product만 바꿔 원인을 분리했다.

```text
존재하지 않는 productId + 닫힌 날짜
→ HTTP 404 NOT_FOUND
→ "일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)"

실재 ACTIVE + SINGLE productId + 같은 닫힌 날짜
→ HTTP 409 CONFLICT
→ "마감된 날짜에는 신규 전표를 만들 수 없습니다."
```

`SlipService.java:257-270`도 product lookup을 먼저 하고 그 뒤 날짜 가드를 호출한다. 따라서 S14가 제외한 404는 날짜 판정에 도달하기 전 제품 검증 응답이며 날짜 가드 결함 표본이 아니다. 두 요청 모두 생성 행 0건이었다.

## 만든/삭제한 QA 데이터

모든 S15 mutation은 실 API로 회수했다. S14 전표 4건과 S14의 soft-delete 기준선은 조회·수정·삭제하지 않았다.

### 전표

| 전표번호 | 종류 | 표식 | 조작 | 종료 상태 |
|---|---|---|---|---|
| `2026/08/08-22` | OUTBOUND | `S15-1123-INBOUND-baseline-cross-OUTBOUND-pass` | 생성 → SAVED → soft-delete | 비활성 |
| `2026/08/08-2` | INBOUND | `S15-1123-INBOUND-closed-blocked` | 교차 종류 생성 → soft-delete | 비활성 |
| `2026/08/08-23` | OUTBOUND | `S15-1123-restore-closed-date-probe` | 생성 → soft-delete → 마감 중 복원 → 재 soft-delete | 비활성 |

차단/검증 실패 표식 2종은 행 0건이다: `S15-1123-INBOUND-closed-dev-warehouse-blocked`, `S15-1123-product-order-probe`.

### 기준선

관리자 API에 메모 필드가 없어 보고서의 `S15-1123`과 실행 순서로 식별한다.

- INBOUND / 2026-08-09: 활성화 3회. 첫 POST는 S15 시작 전부터 있던
  `enabled=false, is_deleted=false` INBOUND seed 행을 재구성했고, 뒤의 2회는 신규 행이었다.
  각 라운드 종료 시 관리자 DELETE했다.
- OUTBOUND / 2026-08-09: 신규 4건 생성 후 각각 관리자 DELETE.
- 같은 INBOUND 기준선을 2026-08-10으로 추가/변경하려던 요청 1건과 동일 날짜 재POST 1건은 409라 행이 생기지 않았다.

따라서 S15가 새로 만든 기준선 행은 6건(INBOUND 2 + OUTBOUND 4)이고, 기존 비활성
INBOUND 행 1건을 추가로 재사용했다. 이 기존 행은 실 DELETE 정리 때문에 최종
`is_deleted=true`가 됐다. 관리자 API에는 `enabled=false`로 되돌리는 endpoint가 없고 DB 직접
UPDATE는 금지되어 원래 비활성·비삭제 상태로 복귀시키지 않았다. 활성 기준선은 남지 않았지만,
이 soft-delete 전환은 S15의 QA 부작용이다. S14의 soft-delete OUTBOUND 기준선은 건드리지 않았다.

최종 읽기 전용 확인:

```text
final_active_baselines=0
final_s15_active_slips=0
```

## 이 라운드가 보지 않은 것

- 모바일 주문·견적 변환·3개 publish 경로는 정적 전수와 복사 실재현까지만 했다. 각 외부 도메인의 유효 원본을 새로 만들며 5개 경로를 모두 live mutation하지 않았다.
- 동일 종류 기준선 동시 POST race는 실행하지 않았다. 직렬 API 409와 DB partial unique index까지만 확인했다.
- KST 자정 전후 두 실시간 요청은 실행하지 않았다. 주입 Clock·LocalDate 비교를 코드로 확인했다.
- S14가 비공개 처리한 최초 invalid product UUID 자체는 재현할 수 없어, 새 invalid UUID와 현재 실재 product의 대조 요청으로 원인만 재현했다.
- soft-delete 복원 endpoint의 데스크톱 운영 UI 배선은 찾지 못했다. 실 JWT gateway API 도달과 권한 enforcement는 확인했다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1123-s15-sol-reconvergence.md`
