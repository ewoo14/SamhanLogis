# PR #1066 / 이슈 #1065 — SOL 5.6 R10 재수렴

> 검증 브랜치: `fix/1065-outbound-inspect-approval-gate`  
> 검증 HEAD: `e66f3eaf2b6e5bc310f792638ca45d687819e10f`  
> 검증일: 2026-08-07  
> 범위: **실 사용자 경로의 도달성**과 PM 실측의 **증거 무결성**만 검증

## 판정 — 도달 결함 0건

R9의 두 도달 결함은 R10에서 재현되지 않는다. 시스템 마스터의 후속 전이 우회는
신뢰된 게이트웨이 헤더로 복구됐고, 결재선 개인의 화면 capability는 현재 상태에서
실제로 가능한 단 하나의 후속 액션에만 적용된다. `CONFIRMED` 상세 조회 확장은 화면이나
서버의 재전이를 열지 않는다.

| R9 실측 역할 | R9 영향 사용자 | R9 요청 조합 | R10 잔존 도달 결함 |
|---|---:|---:|---:|
| MASTER | 2명 | `ship` 16 + `deliver` 10 = 26건 | **0건** |
| SALES 결재선 개인 | 1명 | `ship` 8 + `deliver` 5 + `confirm` 10 = 23건 | **0건** |
| ACCOUNTANT 결재선 개인 | 1명 | `ship` 8 + `deliver` 5 = 13건 | **0건** |

위 사용자·요청 조합 수는 R9가 실 DB에서 센 표본을 R10 코드 경로에 다시 대입한
재판정이다. 이번 라운드에는 도달 결함이 없으므로 신규 영향 역할·실 건수는 없다.

## (a) `X-Is-System-Master` 위조 — 외부 도달 경로 없음

### 게이트웨이 원문

`JwtAuthenticationGatewayFilterFactory.java:225-238`은 보호 라우트에서 모든 inbound
identity 헤더를 먼저 제거한 뒤, 검증된 JWT claim에서 값을 다시 넣는다.

```java
ServerHttpRequest.Builder requestBuilder = request.mutate()
        .headers(h -> {
            HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(h::remove);
            h.add(HEADER_USER_ID, userId);
            h.add(HEADER_IS_SYSTEM_MASTER, String.valueOf(isSystemMaster));
            h.add(HEADER_USER_GROUPS, groups);
            h.add(HEADER_IS_PARTNER, String.valueOf(isPartner));
        });
```

`HttpHeaderConstants.java:88-97`의 제거 목록에는 동명 헤더가 명시돼 있다.

```java
public static final List<String> INBOUND_IDENTITY_HEADERS = List.of(
        CALLER_ID_HEADER,
        IS_SYSTEM_MASTER_HEADER,
        USER_GROUPS_HEADER,
        IS_PARTNER_HEADER,
        PARTNER_CODE_HEADER,
        CALLER_NAME_HEADER,
        USER_DEPARTMENT_HEADER,
        CALLER_ROLE_HEADER,
        INTERNAL_TOKEN_HEADER
);
```

실제 `/api/slips/**`와 `/slips/**` 라우트는 각각
`application.yml:60-66`, `:607-612`에서 `JwtAuthentication`을 반드시 거친다.
위조 `X-Is-System-Master:true`와 비마스터 JWT를 함께 넣는 단일 게이트웨이 회귀도
재실행해 downstream 값이 정확히 `false`가 됨을 확인했다.

```text
:services:api-gateway:test
  --tests JwtAuthenticationGatewayFilterFactoryTest.jwtProtectedSlipRoute_overridesSpoofedIdentityHeadersWithClaims
결과: BUILD SUCCESSFUL
```

### slip-service 직접 접근 경계

운영 compose 원문 `infrastructure/docker-compose.prod.yml:421-422`:

```yaml
ports:
  - "127.0.0.1:8086:8086"
```

ALB target group은 `infrastructure/terraform/ec2.tf:103-129`에서 오직 8080을 향하고,
EC2 보안그룹은 `infrastructure/terraform/vpc.tf:176-193`에서 ALB의 8080과 health-check
Lambda만 허용한다. 따라서 인터넷 사용자가 8086으로 직접 요청하는 배포 경로는 없다.
로컬 개발 compose도 같은 loopback 바인딩이고, 이는 운영 외부 사용자 표면이 아니다.

이 신뢰 계약은 R10 신규가 아니다. `SlipSalesAccessGuard`와 공용 권한 계층이 이미 같은
게이트웨이 주입 헤더를 사용해 왔다. R10은 R9가 제거한 정적 annotation의 선재 시스템
마스터 우회를 세 endpoint의 동적 판정에 복원했을 뿐이다.

## (b) D2 화면 판정 — 상태와 무관한 버튼 개방 없음

화면은 먼저 `actionsForStatus()`로 상태별 액션을 제한한다
(`SlipDetailPage.tsx:304-313`).

```ts
case 'INSPECTING': return ['inspect', 'reject']
case 'COMPLETED':  return mode === 'OUTBOUND' ? ['ship'] : ['confirm']
case 'SHIPPING':   return mode === 'OUTBOUND' ? ['deliver'] : []
case 'DELIVERED':  return mode === 'OUTBOUND' ? ['confirm'] : []
default:           return []
```

그 뒤 `possibleActions`에서 정상 액션 하나를 고르고, 그 액션에 대해서만
`canTransitionSlipAction(..., slip.canInspect === true)`를 적용한다
(`SlipDetailPage.tsx:2335`, `:2563-2565`, `:2652-2659`). 따라서 다음처럼 동작한다.

| 저장 상태 | `canInspect=true`일 때 활성 가능한 후속 액션 |
|---|---|
| INSPECTING | `inspect` |
| COMPLETED | `ship` |
| SHIPPING | `deliver` |
| DELIVERED | `confirm` |
| CONFIRMED | 없음 |

즉 `INSPECTING`에서 `deliver`가 뜨거나 세 후속 버튼이 동시에 활성화되는 경로는 없다.
D2는 자격을 OR할 뿐 상태표를 우회하지 않는다.

## (c) `CONFIRMED` 확장 — 조회를 넘어 재전이하지 않음

FE의 `actionsForStatus`는 `CONFIRMED`를 명시 케이스로 두지 않아 `default: []`를 반환한다.
따라서 데스크톱·모바일 모두 전이 버튼과 클릭 경로가 생성되지 않는다.

직접 POST를 시도해도 `Slip.java:1203-1241`의 도메인 가드가 저장 상태를 다시 검증한다.

```java
public void ship() {
    requireStatus(SlipStatus.COMPLETED);
    // ...
}

public void deliver() {
    requireStatus(SlipStatus.SHIPPING);
    // ...
}

public void confirm() {
    if (this.slipType == SlipType.OUTBOUND) {
        requireStatus(SlipStatus.DELIVERED);
    } else {
        requireStatus(SlipStatus.COMPLETED);
    }
    // ...
}
```

`CONFIRMED` 결재선 개인은 권한 helper까지는 통과할 수 있지만, 위 세 mutation은 모두
상태 불일치 409로 끝난다. D3가 실제로 연 것은 상세 조회와 그 조회 응답의 capability이며,
성공하는 재전이는 아니다.

## (d) 권한 검사 전 `slipService.getOne(id)` — 정보 응답·mutation 없음

`SlipService.getOne`은 `@Transactional(readOnly = true)`이고, 저장 전표 조회 후 담당자·서명자
이름을 내부 user-service GET으로 resolve하고 결재선 authorize GET을 수행한다
(`SlipService.java:1431-1450`, `:1748-1757`). 전표나 외부 데이터를 쓰는 호출은 없다.

`SlipController.checkOutboundPostInspectionPermission`은 이 응답을 지역 변수로만 사용하며,
비결재선·비시스템마스터·무권한이면 `requireAccountPermission`이 403을 던진다. 그 전에
`SlipDetailResponse` 본문을 클라이언트에 반환하는 분기는 없다. 존재하지 않는 UUID는 404,
존재하는 UUID는 최종 403이 될 수 있으나, UUID는 사용자 화면에 노출되지 않고 UUID를 새로
획득하는 무권한 실 사용자 경로도 찾지 못했다. 이미 알고 있는 전표 UUID에는 존재 여부가
새 정보가 아니다. 따라서 이번 범위에서 재현 가능한 정보 노출이나 부작용은 0건이다.

## 다섯째 가능성

(a)~(d) 밖에서 R10 변경으로 새로 열린 실 사용자 도달 경로는 찾지 못했다. 내부 Docker
네트워크의 서비스가 임의 identity 헤더를 만들 수 있다는 일반 신뢰 가정은 선재 아키텍처이며,
외부 사용자는 운영 보안그룹·loopback 바인딩 때문에 그 경계에 직접 도달하지 못한다.

## fix 지시서 — 불변식만

추가 fix 지시는 없다. 이후 변경에서도 다음 불변식은 보존되어야 한다.

1. 외부 요청의 identity 헤더는 게이트웨이에서 제거되고, 서명 검증된 JWT claim으로만
   재구성되어야 한다.
2. OUTBOUND 후속 전이의 허용 집합은 시스템 마스터, 해당 정적 계정 권한자, 현재 전표의
   유효한 검수 결재선 개인의 합집합이어야 하며 어느 집합도 감산되면 안 된다.
3. 결재선 capability는 현재 저장 상태가 허용하는 정확한 단일 액션에만 효력이 있어야 한다.
4. `CONFIRMED` 결재선 개인은 상세를 재조회할 수 있어야 하지만 `ship`·`deliver`·`confirm`을
   다시 성공시킬 수 없어야 한다.
5. 권한 판정 전에 수행되는 조회는 응답 정보나 mutation을 권한 실패 요청자에게 남기지
   않아야 한다.

## 양방향 RED

아래는 회귀 시 RED가 되어야 하는 양방향 불변식이다. HEAD에서는 모두 위 원문과 좁은
실행으로 PASS 판정했다.

### 열려야 할 것이 열린다

| RED | 전제 | 기대 | HEAD |
|---|---|---|---|
| OPEN-1 | 시스템 마스터 + OUTBOUND COMPLETED | `ship` 허용 | PASS |
| OPEN-2 | 시스템 마스터 + OUTBOUND SHIPPING | `deliver` 허용 | PASS |
| OPEN-3 | 결재선 개인 + 정적 권한 없음 + OUTBOUND COMPLETED | 화면 `ship` 활성, 서버 허용 | PASS |
| OPEN-4 | 같은 개인 + OUTBOUND SHIPPING | 화면 `deliver` 활성, 서버 허용 | PASS |
| OPEN-5 | 같은 개인 + OUTBOUND DELIVERED | 화면 `confirm` 활성, 서버 허용 | PASS |
| OPEN-6 | 같은 개인 + OUTBOUND CONFIRMED | 상세 재조회 허용 | PASS |

### 닫혀야 할 것이 닫힌다

| RED | 전제 | 기대 | HEAD |
|---|---|---|---|
| CLOSED-1 | 비마스터 JWT + 위조 `X-Is-System-Master:true` | gateway downstream `false` | PASS |
| CLOSED-2 | `canInspect=true` + OUTBOUND INSPECTING | `deliver`·`confirm` 버튼 없음 | PASS |
| CLOSED-3 | `canInspect=true` + OUTBOUND CONFIRMED | 모든 전이 버튼 없음 | PASS |
| CLOSED-4 | CONFIRMED에서 `ship`·`deliver`·`confirm` 직접 POST | 도메인 상태 가드 409 | PASS |
| CLOSED-5 | 비결재자·비마스터·정적 권한 없음 | 후속 전이 403, 화면 실행 불가 | PASS |
| CLOSED-6 | INBOUND | OUTBOUND 결재선 capability로 `ship`·`deliver` 개방 없음 | PASS |

## 증거 무결성

PM의 FE 실측은 동일 명령으로 재현됐다.

```text
명령: npm test -- --run src/renderer/routes/SlipDetailPage.transition.test.ts
결과: Test Files 1 passed (1) / Tests 7 passed (7) / exit 0
```

`session.ts:141-145`의 단정도 정정할 필요가 없다. `syncBuiltinRoleGroup`은 MASTER 역할을
빌트인 MASTER 그룹에 배속하고, 로그인은 `is_system_master=true` 그룹 멤버십으로 JWT
claim을 만든다. 더 직접적으로 `/auth/admin/permissions/my`는
`X-Is-System-Master=true`이면 모든 PageCode 전권을 반환한다
(`PermissionAdminController.java:253-269`). 따라서 FE snapshot에 별도 필드가 없어도
실제 `usePermissions().canAccess`가 시스템 마스터 전이 버튼을 활성화하며, 서버 bypass와
실효 허용 집합이 맞는다.

추가 좁은 실행:

```text
:services:slip-service:test --tests SlipSalesAccessGuardTest
:services:api-gateway:test --tests
  JwtAuthenticationGatewayFilterFactoryTest.jwtProtectedSlipRoute_overridesSpoofedIdentityHeadersWithClaims
결과: BUILD SUCCESSFUL
```

구현자 보고의 FE 128건·BE 관련 테스트·typecheck 전체 수치는 PM 실측 정정 대상이 아니며,
이번 라운드의 도달성 판단에 필요하지 않아 재계수하지 않았다.

## 이번 라운드가 보지 않은 것

- 테스트의 강도·누락·mock 충분성, 문서 표현의 과장, 일반 코드 품질은 보지 않았다.
- 전체 테스트 스위트, FE 128건, typecheck 전체, BE 관련 전체 묶음은 실행하지 않았다.
- 브라우저·renderer·design-system·컨테이너를 띄우거나 빌드·재기동하지 않았다.
- DB와 라이브 컨테이너에 쓰지 않았고, 라이브 mutation도 수행하지 않았다.
- UUID를 이미 알고 있는 공격자·운영 호스트/SSM 접근자·침해된 내부 서비스라는 별도 위협
  모델은 실 사용자 경로가 아니므로 판정 범위에 넣지 않았다.
- `CONFIRMED`를 허용 상태에 포함한 결정 자체는 개발책임자 결정이므로 결함으로 세지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-07-1065-sol-r10-reconvergence.md`
