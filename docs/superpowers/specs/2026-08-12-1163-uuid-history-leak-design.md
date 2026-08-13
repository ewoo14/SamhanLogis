# #1163 UUID 이력·감사 표시 가드 설계

## 목표

이력·감사·편집 요청의 사용자 표시 문자열에 UUID 전체 또는 일부가 들어가는 잔여 경로를 제거한다. 내부 `actorId`/`callerId`는 route key와 join key로 계속 전달한다.

## 설계

- 현재 브랜치의 선행 #1164 변경인 `EditWarehouseModal`의 `변경자 미상` 표시와 inventory `WarehouseService` 이름 해석은 유지한다.
- 백엔드 표시명 경계에서는 `X-User-Name`이 canonical UUID이면 저장/응답 이름으로 사용하지 않는다. 정상 이름은 원문 그대로 보존한다.
- `X-User-Name`이 없고 `X-User-Id`가 UUID이면 UUID를 이름으로 대체하지 않고 기존 화면 선례인 `변경자 미상`을 사용한다. nullable revision 경로는 기존 partner-order 계약에 맞춰 `null`을 유지한다.
- `actorId` 자체와 `deletedBy`/`createdBy` 같은 내부 audit 컬럼은 변경하지 않는다.
- accounting 입금 매칭 audit의 `actorId.toString().substring(0, 8)`은 `actorName` 저장이므로 `변경자 미상`으로 교체한다.
- desktop의 identifier slice는 표시 텍스트와 test id를 분리해 분류한다. 사용자 텍스트의 actor/id fallback만 수정하고 날짜·해시·업무번호·DOM test id 축약은 안전 근거와 함께 보고서에 O로 남긴다.

## 검증

- backend: UUID caller가 `actorName`/`requesterName`으로 저장되지 않고, 정상 이름·SYSTEM·내부 actorId가 보존되는 RED-B 회귀 테스트.
- desktop: null/UUID actor는 `변경자 미상`, 정상 이름과 SYSTEM, revert 조건은 기존과 동일한 Vitest 테스트.
- `clients/desktop` Chromium Playwright real-QA 스펙은 `-real-qa` 디렉터리와 파일명을 사용하고 `resolveQaShotsDir()`로 증거를 저장한다.
- inventory/desktop 기존 표적 테스트와 변경 후 전수 grep 결과를 dev-report에 파일:줄 근거로 기록한다.
