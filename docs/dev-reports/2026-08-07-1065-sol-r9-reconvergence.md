# PR #1066 / 이슈 #1065 — SOL 5.6 R9 재수렴

> 검증 브랜치: `fix/1065-outbound-inspect-approval-gate`  
> 검증 HEAD: `58d856b9a49807ef5e6be1e6e54c1b74948cbdeb`  
> 검증일: 2026-08-07  
> 범위: **실 사용자 경로의 도달성**과 PM 실측의 **증거 무결성**만 검증

## 판정 — 도달 결함 2건

R9는 D2의 403 표시를 실제로 고쳤다. 그러나 D3의 후속 전이에는 실 사용자 도달 결함이 2건 남았다.

| ID | 도달 결함 | 영향 활성 사용자 | 현재 실데이터의 유효 요청 조합 |
|---|---|---:|---:|
| R9-SOL-1 | `ship`·`deliver`에서 시스템 마스터 우회가 사라짐 | MASTER 2명 | 26건 |
| R9-SOL-2 | 결재선 capability가 상세는 열지만 데스크톱 후속 버튼은 열지 않음 | SALES 1명·ACCOUNTANT 1명 | 36건 |
| 합계 | 중복 없는 활성 사용자 4명 | 4명 | 62건 |

여기서 요청 조합은 `활성 사용자 × 현재 상태상 유효한 전표 × 해당 endpoint`이다. 전표 자체의 개수가 아니라, 지금 실제 사용자가 정상 액션을 실행하려 할 때 막히는 조합 수다.

개발책임자가 이미 결정한 `CONFIRMED` 허용 누락은 위 결함 수에 포함하지 않았다.

## R9-SOL-1 — 시스템 마스터 2명의 `ship`·`deliver`가 새로 403

### 실 사용자 도달 경로

1. MASTER 사용자가 매출 전표 상세에 진입한다. 프런트의 권한 목록은 MASTER에게 전권을 주므로 후속 버튼이 활성화된다.
2. `COMPLETED` 전표에서 배송 시작 또는 `SHIPPING` 전표에서 배송 완료를 누른다.
3. R9 이전 `@RequirePermission`은 게이트웨이가 넣은 `X-Is-System-Master=true`를 보고 메서드 실행 전에 통과시켰다.
4. R9 본문 판정은 `X-Is-System-Master`를 받거나 검사하지 않는다. 결재선 개인이 아니면 `account_page_permissions`만 조회한다.
5. 실 DB의 MASTER 2명은 시스템 마스터라 materialized 계정 권한 행이 없고, 출고 검수 결재선에도 없다. 따라서 둘 다 403이다.

### 근거 원문

R9 현재 `SlipController.java:552-569`:

```java
@PostMapping("/{id}/ship")
public ApiResponse<SlipDetailResponse> ship(
        @PathVariable UUID id,
        @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
    checkOutboundPostInspectionPermission(callerHeader, id, "slip.transfer.process");
    return ApiResponse.ok(slipService.ship(id));
}

@PostMapping("/{id}/deliver")
public ApiResponse<SlipDetailResponse> deliver(
        @PathVariable UUID id,
        @RequestHeader(value = CALLER_HEADER, required = false) String callerHeader) {
    checkOutboundPostInspectionPermission(callerHeader, id, "slip.transfer.process");
    return ApiResponse.ok(slipService.deliver(id));
}
```

본문 fallback인 `SlipController.java:824-871`은 `callerHeader`만 UUID로 파싱하고 계정 권한만 검사한다.

```java
if (!approvalLineMember) {
    requireAccountPermission(callerHeader, pageCode, PermissionAction.UPDATE);
}
// ...
if (accountId == null || !dynamicPermissionClient.check(accountId, pageCode, action)) {
    throw new BusinessException(ErrorCode.FORBIDDEN, ...);
}
```

반면 제거된 애노테이션의 `PermissionAspect.java:170-171`은 본문보다 먼저 시스템 마스터를 통과시킨다.

```java
if (isMasterBypass(roleCode, isSystemMasterHeader, hasIndependentRoleHeader)) {
    return joinPoint.proceed();
}
```

실 DB 읽기 결과:

```text
role    active users    slip.transfer.process UPDATE
MASTER  2               0

OUTBOUND COMPLETED  8
OUTBOUND SHIPPING   5
```

두 MASTER 모두 출고 검수 결재선 2명과 다른 계정이다. 따라서 역할별 실 건수는 다음과 같다.

| 역할 | 영향 사용자 | `ship` | `deliver` | 합계 |
|---|---:|---:|---:|---:|
| MASTER | 2 | 2×8 = 16 | 2×5 = 10 | **26** |

### (a)의 나머지 좌표

- INBOUND 전표: 동적 판정에서 결재선 우회가 성립하지 않고 기존 `slip.transfer.process` 권한을 요구한 뒤 도메인 전이가 유형/상태를 거부한다. 성공하는 신규 개방은 없다.
- `slipType = null`: 실 스키마 `slips.slip_type NOT NULL`이며 enum 응답 생성 경로에도 null 성공 경로가 없다.
- 전표 없음: 권한 검사 전 `getOne(id)`가 404를 낸다. 유효 UUID는 화면 비공개이고, 권한 없는 사용자가 새 UUID를 얻는 실 경로는 찾지 못했다. 이미 아는 UUID에 대해서는 존재를 이미 알고 있으므로 이 라운드의 실도달 결함으로 세지 않았다.
- `callerHeader` 없음/빈 값/비 UUID: 결재선 판정 false 뒤 계정 파싱이 null이 되어 403이다. 열린 조합이 없다.
- 선행 `getOne(id)`: `@Transactional(readOnly = true)` 조회와 사용자명/결재선 조회만 수행한다. 전표나 다른 라이브 데이터를 변경하는 부작용은 없다.
- 기존 `slip.transfer.process UPDATE` 보유자: 실 DB의 MANAGER 2명·INVENTORY 1명·WAREHOUSE 1명은 본문 fallback도 true이므로 막히지 않는다.

## R9-SOL-2 — 결재선 개인은 상세에 들어가도 후속 버튼을 실행할 수 없음

### 실 사용자 도달 경로

1. 출고 검수 결재선 개인이 `COMPLETED`·`SHIPPING`·`DELIVERED` 전표 상세을 연다.
2. R9 서버는 확장된 `isOutboundInspectApprovalMember` 결과를 `SlipDetailResponse.canInspect=true`로 내려 상세 조회를 허용한다.
3. 데스크톱은 같은 `canInspect`를 `inspect` 액션에만 정적 권한 대체값으로 사용한다.
4. 따라서 `slip.transfer.process UPDATE`가 없는 두 결재선 개인에게 `ship`·`deliver` 버튼이 비활성이다. `sales.slip.confirm UPDATE`도 없는 SALES 결재선 개인에게는 `confirm`도 비활성이다.
5. 서버 endpoint는 이들을 허용하도록 고쳐졌지만 실 UI에는 호출 표면이 없다.

### 근거 원문

호출부 전수는 다음 3곳뿐이다.

```text
SlipController.java:529   inspect endpoint의 현재 상태 판정
SlipController.java:828   ship·deliver·confirm 동적 판정
SlipService.java:1447     상세 응답 canInspect 계산
```

`SlipService.java:1447-1449`:

```java
boolean canInspect = isOutboundInspectApprovalMember(
        slip.getSlipType(), slip.getStatus(), actorUserId);
return SlipDetailResponse.from(..., canInspect);
```

`SlipDetailPage.tsx:1294-1306`은 이 capability를 후속 전이에 쓰지 않는다.

```ts
if (action === 'inspect' && mode === 'OUTBOUND' && !canInspect) return false

return slipActionPermissionRequirements(action, mode)
  .every(({ pageCode, action: permissionAction }) => {
    if (canAccess(pageCode, permissionAction)) return true
    return action === 'inspect'
      && mode === 'OUTBOUND'
      && pageCode === 'slip.transfer.process'
      && canInspect
  })
```

실 결재선·권한·전표 상태:

```text
OUTBOUND_INSPECT USER approver 2명
  SALES       1명: transfer UPDATE=false, confirm UPDATE=false
  ACCOUNTANT  1명: transfer UPDATE=false, confirm UPDATE=true

OUTBOUND COMPLETED 8 / SHIPPING 5 / DELIVERED 10
```

| 역할 | 영향 사용자 | `ship` | `deliver` | `confirm` | 합계 |
|---|---:|---:|---:|---:|---:|
| SALES | 1 | 8 | 5 | 10 | **23** |
| ACCOUNTANT | 1 | 8 | 5 | 0 | **13** |
| 합계 | 2 | 16 | 10 | 10 | **36** |

### (b)의 다른 호출부 누수 판정

- `inspect` endpoint가 나중 상태에서 결재선 true를 얻더라도 도메인 상태 전이가 409를 내므로 성공하는 신규 mutation은 없다.
- 상세 조회 가드가 네 상태에서 결재선 개인을 허용하는 것은 D3의 후속 전이·재조회 목적과 일치한다.
- INBOUND와 다른 액션에는 OUTBOUND 결재선 capability가 적용되지 않는다.
- 별도의 넷째 가능성은 찾지 못했다. R9-SOL-2는 상태 확장 결과가 `canInspect`라는 기존 단일목적 capability로 새어 들어간 (b)의 직접 결과로 분류했다.

## (c) 상세 403 표시는 실제로 동작함

### 전달 경로

1. `getSlip(id)`는 `apiClient.get()`을 catch하거나 재포장하지 않는다.
2. 공통 response interceptor는 401만 별도 처리하고 마지막에 원래 `err`를 `Promise.reject(err)`한다.
3. TanStack Query의 `detailQuery.error`에는 원래 AxiosError가 남는다.
4. `slipDetailErrorMessage`가 `error.response.status`를 읽으므로 실제 403에서 권한 안내와 목록 버튼이 나온다.

실행 중 slip-service의 실제 INSPECTING 출고전표에 비결재 ACCOUNTANT 헤더로 **GET만** 수행한 Axios 관측값:

```json
{"isAxiosError":true,"status":403,"hasResponse":true,"sameShape":true}
```

따라서 Axios wrapper·인터셉터가 status를 없앤다는 가설은 기각한다. D2는 도달 경로에서 유효하다.

## fix 지시서 — 불변식만

1. OUTBOUND `ship`·`deliver`의 최종 허용 집합은 **기존 시스템 마스터 ∪ 해당 정적 계정 권한자 ∪ 현재 상태에서 유효한 출고 검수 결재선 개인**이어야 한다. 어느 한 집합도 감산되어서는 안 된다.
2. OUTBOUND `confirm`의 최종 허용 집합도 **기존 시스템 마스터 ∪ `sales.slip.confirm UPDATE` 권한자 ∪ 현재 상태에서 유효한 출고 검수 결재선 개인**이어야 한다.
3. 서버가 상세 응답으로 부여한 결재선 capability는 데스크톱·모바일의 모든 실제 실행 표면에서 `inspect`뿐 아니라 허용 상태의 `ship`·`deliver`·`confirm`까지 동일한 OR 계약으로 소비되어야 한다.
4. capability는 OUTBOUND의 정확한 상태·액션 조합에만 효력이 있어야 한다. INBOUND, 무관 액션, 무효 상태, 비결재자, 헤더 없음·위조 불가 경로를 열어서는 안 된다.
5. 개발책임자 결정대로 상세 조회와 capability의 허용 상태에는 다음 fix에서 `CONFIRMED`도 포함되어야 한다. 이 항목은 이번 라운드 결함 수에는 포함하지 않는다.
6. 권한 판정 실패·결재선 조회 실패는 기존 정적 권한 또는 시스템 마스터 권한을 감산해서는 안 되며, 아무 허용 근거도 없는 요청은 계속 403이어야 한다.

## 양방향 RED

### 열려야 할 것이 열린다 — 현재 RED

| RED | 전제 | 기대 | 현재 |
|---|---|---|---|
| OPEN-1 | 시스템 마스터, 계정 권한 행 없음, OUTBOUND COMPLETED | `ship` 허용 | 403 |
| OPEN-2 | 시스템 마스터, 계정 권한 행 없음, OUTBOUND SHIPPING | `deliver` 허용 | 403 |
| OPEN-3 | 결재선 개인, 정적 transfer 권한 없음, `canInspect=true`, OUTBOUND COMPLETED | 데스크톱·모바일 `ship` 실행 가능 | 버튼 비활성 |
| OPEN-4 | 같은 조건, OUTBOUND SHIPPING | `deliver` 실행 가능 | 버튼 비활성 |
| OPEN-5 | 결재선 개인, 정적 confirm 권한 없음, OUTBOUND DELIVERED | `confirm` 실행 가능 | 버튼 비활성 |

### 닫혀야 할 것이 닫힌다 — fix 후에도 유지할 RED

| RED | 전제 | 기대 |
|---|---|---|
| CLOSED-1 | 비결재자이며 정적 권한·시스템 마스터 근거 없음 | `ship`·`deliver`·`confirm` 모두 403, UI 실행 불가 |
| CLOSED-2 | `X-User-Id` 없음·빈 값·비 UUID | 결재선 우회 불가, 다른 허용 근거 없으면 403 |
| CLOSED-3 | INBOUND 또는 OUTBOUND의 무효 상태 | OUTBOUND 결재선 capability로 후속 액션이 열리지 않음 |
| CLOSED-4 | 결재선 조회 실패·빈 응답 | capability fail-closed, 다른 허용 근거 없으면 403 |
| CLOSED-5 | PARTNER identity | 직원 계정 권한·결재선 권한을 빌려 후속 전이를 실행할 수 없음 |

## 증거 무결성

PM 실측은 재현됐다.

```text
명령: npm test -- --run src/renderer/routes/SlipDetailPage.transition.test.ts
결과: Test Files 1 passed (1) / Tests 6 passed (6) / exit 0
```

구현자 보고의 5파일 134건·typecheck·백엔드 대상 테스트는 PM 실측 정정 대상이 아니고, 이번 라운드의 유일 질문인 도달성 판단에도 필요하지 않아 재계수하지 않았다.

## 이번 라운드가 보지 않은 것

- 테스트의 강도·누락·mock 충분성, 문서 표현의 과장 여부, 일반 코드 품질은 보지 않았다.
- 전체 테스트 스위트, typecheck 전체, 백엔드 전체/대상 테스트는 실행하지 않았다.
- 브라우저·renderer·design-system·컨테이너를 띄우거나 빌드·재기동하지 않았다.
- DB와 라이브 컨테이너에는 쓰지 않았다. 실데이터는 SQL SELECT와 실제 서비스 GET만 사용했다.
- 개발책임자가 다음 fix로 확정한 `CONFIRMED` 허용 누락은 결함으로 세지 않았다.
