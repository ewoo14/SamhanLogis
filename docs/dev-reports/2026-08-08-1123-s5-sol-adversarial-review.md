# PR #1124 / Issue #1123 — 1차 적대검증 중단 보고

## 결론

요청에 명시된 중단 조건이 발화해 검증을 중단했다.

- 전제: `auth-service`는 Flyway 체크섬 불일치로 기동 불가
- 관측: `samhan-auth-service`는 2026-08-08 10:00:06 KST에 정상 기동했고, Docker 상태는 `running | healthy | restart 0`이었다.
- 기동 로그: Flyway가 94개 마이그레이션을 성공적으로 검증하고 V94를 적용한 뒤 Tomcat과 `AuthServiceApplication`이 시작됐다.
- 동시에 `slip_db`에는 PR의 V118 이력과 `slip_closing_baselines`, `slip_closing_date_rules` 테이블이 없었다.

따라서 현재 실행 환경은 요청서의 “인증 서비스 기동 불가” 상태가 아니며, PR #1124의 마감 정책 스키마가 적용된 런타임도 아니다. 다른 복구 트랙이 환경을 바꿨거나 현재 컨테이너 이미지와 검증 대상 HEAD가 어긋난 제3 가능성이 있다. 개발책임자의 지시인 “전제가 틀렸다면 고치지 말고 중단·보고”에 따라 Docker 재기동, 로그인 시도, 라이브QA, 마이그레이션 적용 없이 중단했다.

**표본 0 = 결함 0이 아니라 판정 불가.** 정책 테이블이 존재하지 않아 실 데이터에서 마감/비마감 발화 건수를 셀 수 없었다.

## 중단 전 확보한 코드 도달성 증거

### 1. 기본 비활성 및 권한 코드

- V118은 `OUTBOUND`, `INBOUND` 기준선을 각각 `enabled=FALSE`로 seed한다.
- 코드상 기준선이 없거나 비활성이면 `SlipClosedDateGuard`는 명시 `MANUAL_CLOSED` 규칙이 없는 날짜를 통과시킨다.
- 예외 권한 문자열은 다음 위치에서 모두 `slip.closed-date-exception`으로 일치했다.
  - slip 서버 `SlipClosedDateGuard.PAGE_CODE`
  - auth 서버 `PageCode.SLIP_CLOSED_DATE_EXCEPTION`
  - auth V95 role/group seed
  - desktop `permissionsApi.ts` PageCode union
  - desktop `PermissionMatrixPage.tsx` 표시명
- 다만 실행 `auth_db`의 V95 도달 여부와 실제 계정의 유효 권한 해석은 중단 조건 발화로 전수 판정하지 않았다.

### 2. `assertCreatable` 운영 호출점

테스트를 제외한 호출점은 7곳이었다.

| 경로 | 전달 `SlipType` | 코드상 생성 종류 |
|---|---|---|
| 수동 생성 `SlipService.create` | 요청 `req.slipType()` | 요청 종류에 따라 `OUTBOUND`/`INBOUND` 분기 |
| 전표 복사 `SlipDuplicateService.duplicate` | `source.getSlipType()` | 원본 종류에 따라 분기 |
| 견적 변환 `EstimateToSlipConverter.convert` | `OUTBOUND` | `Slip.createOutbound` |
| 모바일 주문 `MobilePartnerOrderService.createOrder` | `OUTBOUND` | `Slip.createOutbound` |
| 견적 발행 `SlipPublishService.publishFromEstimate` | `OUTBOUND` | `Slip.createOutbound` |
| 주문 발행 `SlipPublishService.publishFromPartnerOrder` | `OUTBOUND` | `Slip.createOutbound` |
| 주문 병합 발행 `SlipPublishService.publishFromOrdersMerge` | `OUTBOUND` | `Slip.createOutbound` |

중단 전 확인한 7곳에서는 전달 `SlipType`과 실제 생성 종류의 불일치를 발견하지 못했다. 이는 전체 라운드 완료 판정이 아니라 정적 호출점 대조 결과다.

### 3. 두 마감 게이트의 부분 상호작용

공유 생성 경로에서 확인된 순서는 날짜 마감 `closedDateGuard.assertCreatable(...)`가 먼저이고 배송태그 시각 마감 `cutoffGuard.assertWithinCutoff(...)`가 뒤였다.

정적으로 도달 가능한 안내 단절이 있다.

1. 오늘 날짜가 날짜 마감이면 비예외 사용자는 먼저 “마감된 날짜에는 신규 전표를 만들 수 없습니다.”를 받는다.
2. 날짜 마감 예외 권한자는 첫 게이트를 통과한 뒤 시각 마감에 걸리면 “익일 출고로 생성하세요”를 받는다.
3. 익일도 `MANUAL_CLOSED`이면 사용자가 안내대로 익일을 선택해도 날짜 마감 게이트가 다시 막는다.

즉 `OutboundCutoffGuard`는 익일의 `SlipClosedDateGuard` 상태를 확인하지 않고 무조건 익일을 안내한다. #1074가 고친 “안내를 따를 수 없다” 상태가 익일 날짜 마감과 결합하면 다시 도달 가능하다. 단, 현재 DB에는 정책 테이블이 없어 실 데이터 발화 건수는 0건이 아니라 판정 불가다.

## 범위 대조 — 중단 전 확인분

슬라이스 1 구현 보고서는 다음 범위를 구현했다고 적었다.

- 덮음: `slips` 신규 생성의 수동·복사·견적변환·견적발행·주문발행·주문병합·모바일 주문 경로
- 남김을 명시: 칩 UI, 회계 분개전표, 견적서 자체, 주문서 자체

따라서 “전체(전표·분개·견적·주문)” 결정 중 슬라이스 1이 실제로 덮었다고 주장한 표면은 `Slip` 신규 생성 게이트이며, 회계 분개·견적 문서 자체·주문 문서 자체는 미구현으로 명시돼 있었다. 중단 전 범위 문구와 호출점 사이에서 “덮었다고 적고 호출점이 없는” 표면은 확인하지 못했으나, 생성 표면 전수성은 라운드 중단으로 최종 확정하지 않았다.

## 실행 및 증거 무결성

- HEAD: `b246e386b7d8dafbd88a64825b74872b179fc7eb`
- 시작 시 작업트리: clean
- Docker 재기동/재배포: 하지 않음
- DB 쓰기 및 Flyway 실행: 하지 않음
- DB 접근: `SELECT` 및 메타데이터 조회만 수행
- 평문 비밀번호 출력: 없음
- 코드 수정/커밋/push: 하지 않음
- 신규 파일: 이 보고서 1개

## 이 라운드가 보지 않은 것

- 라이브QA와 GUI 판정은 지시대로 수행하지 않았다.
- 로그인 성공 여부를 시험하지 않았다.
- 정책 테이블이 없는 현재 런타임에 마이그레이션을 적용하지 않았다.
- 마감되지 않은 날짜의 실 생성 성공/실패 건수는 정책 스키마 미도달로 판정하지 못했다.
- 실제 계정별 `slip.closed-date-exception` 유효 권한과 예외 통과 건수는 판정하지 못했다.
- 두 게이트 동시 발화의 HTTP 응답과 desktop 표시 결과는 실행하지 않았다.
- 회계 분개·견적서·주문서 자체 생성 표면의 후속 슬라이스 구현은 검증하지 않았다.
- 전체 테스트 스위트와 Gradle 테스트는 실행하지 않았다. 제공된 CI 43/43 green을 재실행 검증하지 않았다.
