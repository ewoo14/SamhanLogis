# 901/894 서버 메뉴 catalog 설계

## 범위

이번 슬라이스는 결정 B만 다룬다. Claude 도구 호출과 채팅방 lifecycle은 포함하지 않는다.

## 목표

`auth-service`가 앱별 메뉴 메타데이터의 서버 정본을 소유하고, 인증된 계정의 `VIEW` 권한과 교집합한 catalog를 본체 데스크톱·아로로지스 데스크톱·향후 Claude 되묻기가 공통으로 사용한다.

## 현재 근거

- 본체 `AppLayout.tsx`의 `배차` 그룹은 11개 메뉴다.
- pageCode는 메뉴 11개와 1:1이 아니다. `dispatch.board`, `arologis.dispatch.ops`, `arologis.admin` 등이 여러 메뉴를 덮는다.
- 본체의 `/arologis/manual`은 route는 있지만 공식 메뉴가 아니므로 catalog에 넣지 않는다.
- 아로로지스 데스크톱은 4개 기본 메뉴와 권한 보유 시 `수신 배차 그룹`까지 총 5개 후보를 가진다.
- 현재 아로로지스의 기본 링크는 권한 없이 표시되고 route 진입 때만 보호되므로, catalog 기반 메뉴 숨김이 필요하다. route guard는 제거하지 않는다.

## 서버 설계

`auth-service`에 변경 불변 `MenuCatalogEntry` 목록을 둔다. DB migration이나 메뉴 메타데이터 테이블은 만들지 않는다.

각 항목은 다음을 가진다.

- `app`: `samhan-public` 또는 `arologis`
- `category`: 표시 그룹
- `label`: 서버 정본 표시명
- `route`: FE route
- `pageCode`: 권한 pageCode
- `action`: 현재는 `VIEW` 고정
- `visible`: 공식 메뉴 여부
- `order`: 그룹 내 순서

`GET /auth/admin/menu-catalog`는 인증된 현재 주체의 권한만 사용한다. account UUID를 query/path/body로 받지 않는다. `X-Is-System-Master=true`는 기존 `/my` 계약과 동일하게 전체 catalog 권한으로 처리하되, `X-Is-Partner=true`는 빈 목록으로 fail-closed한다. 일반 계정은 `accountPermissionService.bulkLoad(X-User-Id)`와 `VIEW` 교집합만 반환한다.

응답에는 UUID 또는 내부 DB id를 넣지 않는다. `visible=false` 항목은 서버 목록에도 포함하지 않는다.

## FE 설계

본체 `AppLayout.tsx`와 아로로지스 `DispatchesLayout.tsx`가 catalog API를 호출한다. catalog가 준비되기 전에는 메뉴를 만들지 않고, 준비 후에는 `app`, `category`, `order`, `route`를 기준으로 렌더링한다. 기존 route guard와 직접 진입 차단은 유지한다.

기존 본체 11개와 아로로지스의 기본 4개 및 `수신 배차 그룹`은 계약 테스트로 고정한다. catalog 조회 실패는 메뉴 누락을 정상 상태로 간주하지 않으며, 화면에는 오류/재시도 상태를 표시한다.

## 테스트 게이트

RED에서 다음을 먼저 검증한다.

1. catalog endpoint가 현재 존재하지 않아 실패한다.
2. 인증 주체별 권한 교집합이 필요하다.
3. 로그인 없이 조회가 거부되어야 한다.
4. UUID가 응답에 없어야 한다.
5. 본체 11개, 아로로지스 5개, 숨김 route 제외가 정확해야 한다.
6. FE는 권한 없는 catalog 항목을 렌더링하지 않는다.

GREEN 이후에는 auth-service 단위/통합 테스트, desktop Vitest, Playwright 두 계정 QA를 실행한다. 캡처는 `_local/`에만 저장하고 SHA-256 중복을 직접 검사한다.

## 불변식 대응

| 불변식 | 보장 방식 |
|---|---|
| 서버·FE·Claude 동일 정본 | auth-service catalog API 단일 출처 |
| 권한 교집합 | 서버에서 `VIEW` 필터 후 응답 |
| UUID 비노출 | DTO에 UUID/id 필드 없음, 계약 테스트 |
| 기존 메뉴 유지 | 11+5 항목 정합성 계약 테스트 및 Playwright |
| 조회 인증 필수 | 인증 주체 기반 endpoint와 unauthenticated 테스트 |

