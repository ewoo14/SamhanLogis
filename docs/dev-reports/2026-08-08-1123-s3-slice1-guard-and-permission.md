# Issue #1123 슬라이스 1 구현 보고서

## 범위

- 전표 마감 저장 모델
- `SlipType × Slip.slipDate` 신규 전표 생성 서버 게이트
- 동적 예외 권한 `slip.closed-date-exception`
- 이번 슬라이스에서 칩 UI·회계 분개전표·견적서·주문서 자체의 마감은 구현하지 않음

## 구현 결과

### 저장 모델

- `slip_closing_baselines`: 전표 종류별 자동 마감 기준선과 `enabled` 설정
- `slip_closing_date_rules`: `OPEN_EXCEPTION`(기준선 아래에서 다시 연 날짜), `MANUAL_CLOSED`(기준선 이후 명시 마감)
- 마감 판정은 날짜 행을 자동 생성하지 않고 기준선과 규칙을 합산한다.
- 기준선 seed는 `OUTBOUND`·`INBOUND` 모두 `enabled=FALSE`로 작성했다. 테스트·시드 환경에 자동 마감이 기본 활성화되지 않는다.
- 활성 행에만 partial unique index를 적용해 soft-delete 후 같은 종류·날짜를 다시 등록할 수 있다.

### 서버 게이트

`SlipClosedDateGuard`를 다음 런타임 신규 생성 경로에 연결했다.

- 수동 전표 생성 (`SlipService`)
- 견적→출고전표 변환
- 견적 발행
- 거래처 주문 발행
- 주문 병합 발행
- 모바일 거래처 주문
- 전표 복사(출고·입고)

기존 배송태그별 마감 시각 게이트와 기존 전표 수정 경로는 변경하지 않았다. 마감 날짜가 아니면 권한 조회도 하지 않으며, 자동 기준선이 비활성인 동안 과거 날짜 신규 생성이 통과한다(RED-B). `OPEN_EXCEPTION`은 기준선보다 우선해 즉시 다시 연다. `SlipType`을 조회 키로 사용하므로 OUTBOUND 마감이 INBOUND를 차단하지 않는다(RED-G).

### 권한

- PageCode: `slip.closed-date-exception`
- 예외 판정 action: `CREATE`
- Flyway seed 기본값: `MASTER`, `MANAGER`만 `can_view=true`, `can_create=true`
- 나머지 역할은 이 seed에서 권한을 부여하지 않는다.
- 마이그레이션은 작성만 했고 실행하지 않았다.

## 테스트 및 검증

실행 명령:

```text
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.service.SlipServiceTest --tests com.samhanair.logis.slip.service.closing.SlipClosedDateGuardTest --tests com.samhanair.logis.slip.estimate.service.EstimateToSlipConverterAuthoritativeAmountsTest --tests com.samhanair.logis.slip.publish.SlipPublishFingerprintTest
.\gradlew.bat :services:slip-service:compileJava :services:auth-service:compileJava
git diff --check
```

결과:

- `SlipServiceTest`: 49건, 실패 0건
- `SlipClosedDateGuardTest`: 5건, 실패 0건
- `EstimateToSlipConverterAuthoritativeAmountsTest`: 3건, 실패 0건
- `SlipPublishFingerprintTest`: 8건, 실패 0건
- 합계: 65건, 실패 0건
- slip/auth Java compile: 성공
- `git diff --check`: 오류 없음

정찰 기준선 active 과거 전표 367건은 자동 기준선 기본 비활성으로 보존된다. DB SELECT 외의 INSERT/UPDATE/DELETE는 수행하지 않았고 공유 Docker 스택도 재기동하지 않았다.

## 변경 파일

신규:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosingBaseline.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosingBaselineRepository.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosingDateRule.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosingDateRuleRepository.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosingDateRuleType.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosedDateException.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuard.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuardTest.java`
- `services/slip-service/src/main/resources/db/migration/V61__create_slip_closed_date_policy.sql`
- `services/auth-service/src/main/resources/db/migration/V95__seed_slip_closed_date_exception_permission.sql`
- `docs/dev-reports/2026-08-08-1123-s3-slice1-guard-and-permission.md`

수정:

- `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- slip-service의 수동·변환·발행·모바일·복사 생성 서비스 5개
- 해당 생성 경로 회귀 테스트 3개

`git diff --stat` 기준 추적 파일 통계는 47 insertions, 2 deletions이며, 아직 추적하지 않은 신규 파일은 해당 명령 통계에 포함되지 않는다. 삭제 줄 수는 2줄이다.

## 운영 제약 확인

- 커밋하지 않음
- push하지 않음
- 마이그레이션 실행하지 않음
- 공유 Docker 스택 재기동하지 않음
