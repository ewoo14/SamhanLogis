# PR #1066 / 이슈 #1065 — R7 SOL 재수렴

> **컨테이너 선확인:** 라운드 시작 시 `docker inspect -f '{{.Created}}' samhan-slip-service` 결과는 `2026-08-05T21:00:20.201807349Z`였다. 상세 inspect 결과 compose working directory가 다른 트랙 `C:\dev\Samhan-Public\.claude\worktrees\t1075\infrastructure`였고 이미지 ID는 `sha256:406d538b...`였다. 검증 도중 같은 `t1075`가 컨테이너를 다시 교체해 종료 시점에는 `Created=2026-08-05T21:05:59.392347652Z`, 이미지 `sha256:b9c4dcf...`, `running`이었다. 본 라운드는 이 컨테이너에 API 호출·재시작·재배포를 하지 않았고 PR #1066 판정에 사용하지 않았다.

## 1. 판정

**실 사용자 경로로 재현 가능한 결함 0건.**

R5의 두 결함은 HEAD `76c576f743578881cd93be7273f41ddc157a8d72`에서 재현되지 않았다. 결재선 개인은 서버 계산 `canInspect=true`일 때 상세 화면의 데스크톱·모바일 버튼과 클릭 경로를 통과하고, 비결재선 계정은 화면과 POST 양쪽에서 차단된다. INBOUND 완료 라벨은 `입고 완료`, OUTBOUND는 `출고 완료`로 분리된다.

다음은 결함 0 판정에 포함하지 않은 별도 항목이다.

- **HEAD 라이브 화면·POST: 판정 불가.** 실행 컨테이너가 검증 중에도 `t1075`에 의해 교체됐으므로 이 PR 바이너리의 실 클릭과 실 POST 200/403은 수행하지 않았다.
- **이미 완료·비활성 결재선: 모델상 셋째 가능성.** 현재 결재선은 `documentType + actionKey` 전역 설정이며 전표별 결재 인스턴스, 완료 상태, 활성 플래그, 유효기간이 없다. soft-delete만 존재한다. 따라서 “이미 완료/비활성” 조합은 false를 판정할 저장 상태 자체가 없다.
- **다른 회사/조직 범위: 모델상 셋째 가능성.** `slips`, `approval_line_config`, `approval_line_approver`, `accounts`에 company/organization/tenant 식별자가 없고 gateway identity에도 해당 범위가 없다. 현 단일 회사 모델에서는 교차 회사/조직 반례를 구성할 수 없다.

## 2. 권한 누출 전수

`canInspect` 생성은 `SlipService.isOutboundInspectApprovalMember()` 한 곳이다. true의 필요조건은 저장 전표 `OUTBOUND`, 저장 상태 `INSPECTING`, 유효한 UUID 사용자, auth 응답 `configured=true && allowed=true`의 동시 충족이다. 요청 본문은 관여하지 않는다.

| false여야 하는 조합 | 확인 결과 |
|---|---|
| 결재선 밖 계정 | auth 인가 테스트의 `configured=true/allowed=false`, slip IT의 비결재자 GET/POST 403으로 확인 |
| 빈 결재선 | auth 인가 테스트의 결재자 0명 및 미존재 actionKey가 `false/false`; slip helper는 `configured && allowed`라 false |
| 삭제된 config/approver | repository가 config·approver 모두 `isDeletedFalse`로 조회. 실 DB의 OUTBOUND_INSPECT에는 삭제 approver 3행과 활성 USER 2행이 있으며 삭제 3행은 인가 집합에서 제외 |
| 이미 완료·비활성 결재선 | 위 1절의 모델 부재 항목. 완료/active 상태가 없어 조합 불가 |
| 다른 전표 유형 | helper 첫 조건 `slipType != OUTBOUND`에서 false. INBOUND는 기존 INBOUND_INSPECT 경로를 별도로 사용 |
| `INSPECTING` 아닌 상태 | helper 첫 조건에서 false. 통합 테스트는 OUTBOUND 비-INSPECTING 상세 403 및 DRAFT `/inspect` 409 확인 |
| soft-delete 전표 | `Slip`의 `@SQLRestriction("is_deleted = false")`와 `loadOrThrow(findById)` 때문에 상세 진입 전 404. 실 DB soft-delete 110건 중 OUTBOUND×INSPECTING은 0건 |
| 다른 회사/조직 | 위 1절의 모델 부재 항목. 단일 회사 모델에서 조합 불가 |

형제 엔드포인트 전수 결과:

- capability 우회가 붙은 mutation은 `POST /slips/{id}/inspect` 하나뿐이다.
- `/accept`, `/process`, `/complete`, `/ship`, `/deliver`는 모두 `@RequirePermission(page="slip.transfer.process", action=UPDATE)`를 유지한다.
- `/confirm`은 별도 `sales.slip.confirm:UPDATE` 동적 권한을 유지한다.
- 상세 `GET /slips/{id}`의 `&& response.canInspect()`는 기존 영업 상세 읽기 권한이 없는 결재선 개인에게만 읽기 예외를 준다.
- 목록은 `SlipResponse`를 사용하며 `canInspect`가 없다. OUTBOUND inspect 전이 버튼은 목록이 아니라 공용 `SlipDetailPage`에만 존재하므로 목록 capability 누출이나 목록 버튼 오판정 경로는 없다.

클라이언트가 위조된 `canInspect=true` 응답을 받았다고 가정해도 POST는 독립 차단된다. `/inspect` controller가 서버 저장 전표와 `X-User-Id`로 결재선을 다시 조회하고, `SlipService.inspect()`가 같은 auth client로 다시 `enforceSlipApprovalLine()`을 수행한다. 외부 정상 경로에서는 gateway가 JWT의 사용자 ID로 `X-User-Id`를 remove-then-set한다.

## 3. 기존 전이·라벨·실 DB 표본

실 DB 활성 전표 수:

| 유형 | DRAFT | PROCESSING | INSPECTING | COMPLETED | SHIPPING | DELIVERED | CONFIRMED |
|---|---:|---:|---:|---:|---:|---:|---:|
| OUTBOUND | 2,194 | 8 | 7 | 7 | 5 | 10 | 4 |
| INBOUND | 12 | 5 | 2 | 9 | 0 | 0 | 1 |

추가로 활성 OUTBOUND `ACCEPTED=6`, `SENT=29`, `SAVED=12`; 활성 INBOUND `ACCEPTED=6`, `SENT=2`, `SAVED=3`이다. R6 capability가 true 후보로 삼을 수 있는 실 전표는 OUTBOUND×INSPECTING 7건뿐이다. 그중 R5 생성 표본 `2026/08/07-3`도 활성 INSPECTING으로 남아 있다.

실 auth DB의 OUTBOUND_INSPECT 활성 개인 결재자는 `kimgicheol`과 `kimeunji` 2명이며 둘 다 enabled, non-deleted, non-locked다. `slip.transfer.process:UPDATE`는 매니저·재고원·창고원 그룹에서 true이고 영업원·회계원에서는 false다. MASTER는 system-master 우회 계약을 유지한다. 따라서 결재선 개인 2명에게만 새 capability 경로가 필요하고, MANAGER·MASTER·INVENTORY·WAREHOUSE의 기존 정적 전이는 바뀌지 않는다.

라벨은 공용 `SlipDetailPage`의 두 실제 route `/sales/:id`(OUTBOUND), `/purchases/:id`(INBOUND)가 사용한다. 모바일 primary action과 데스크톱 footer/title 세 곳이 모두 `labelForAction(action, mode)`를 호출한다. `complete`만 OUTBOUND `출고 완료`, INBOUND `입고 완료`로 분기하고 나머지 action 라벨은 기존 값을 유지한다. 다른 slip type이나 별도 화면 모드는 없다.

## 4. 상태 사슬과 회계 배분

코드와 통합 테스트의 OUTBOUND 사슬은 다음과 같이 끝까지 연결된다.

```text
PROCESSING --complete--> INSPECTING --inspect--> COMPLETED
           --ship--> SHIPPING --deliver--> DELIVERED --confirm--> CONFIRMED
```

INBOUND는 `INSPECTING --inspect--> COMPLETED --confirm--> CONFIRMED`다. OUTBOUND는 도메인 규칙상 COMPLETED에서 CONFIRMED로 직행하지 않고 배송 두 단계를 거친다. `SlipInspectControllerIT.outbound_fullLifecycle_includingInspecting`이 DRAFT부터 CONFIRMED까지 10단계를 실행했다.

회계 배분은 CONFIRMED 전표만 원천으로 허용된다. accounting의 sales/purchase create attempt가 slip-service line snapshot을 다시 읽고 각각 `slipType=OUTBOUND/INBOUND`, `slipStatus=CONFIRMED`를 서버에서 강제한다. 따라서 위 사슬의 CONFIRMED 도달 뒤 회계 배분까지 새 capability로 인한 추가 차단은 없다. 라이브 회계 배분은 `t1075` 컨테이너 혼재 때문에 수행하지 않았으며 결함 0 실증에 포함하지 않았다.

## 5. 증거 무결성·미확인 범위·파일

HEAD에서 캐시를 배제해 재실행했다.

```text
clients/desktop
npx vitest run src/renderer/routes/
Test Files 74 passed (74)
Tests 704 passed (704)
Exit code 0
```

```text
.\gradlew.bat :services:slip-service:test \
  --tests 'com.samhanair.logis.slip.it.SlipOutboundApprovalEnforcementIT' \
  --tests 'com.samhanair.logis.slip.it.SlipInspectControllerIT' \
  --no-daemon --rerun-tasks --console=plain
BUILD SUCCESSFUL in 1m 22s
SlipInspectControllerIT 9/9, SlipOutboundApprovalEnforcementIT 9/9
failures=0, errors=0, skipped=0
```

```text
.\gradlew.bat :services:auth-service:test \
  --tests 'com.samhanair.logis.auth.service.ApprovalLineAuthorizationServiceTest' \
  --no-daemon --rerun-tasks --console=plain
BUILD SUCCESSFUL in 40s
9/9, failures=0, errors=0, skipped=0
```

안 본 범위: PR #1066 바이너리의 실 브라우저 클릭·실 GET capability·실 POST 200/403·실 회계 배분, vendor 발송, 다른 트랙 `#1069`·`#1075` 파일 내용. Docker 재빌드·재배포·중지, DB 직접 쓰기, Git add/commit/push는 수행하지 않았다. 로그인 응답이나 토큰 원문을 저장하지 않았고 `.log` 및 QA 드라이버를 만들지 않았다.

새 파일: `docs/dev-reports/2026-08-06-1065-r7-sol-reconvergence.md` 1개. 코드 수정·삭제 파일 없음.
