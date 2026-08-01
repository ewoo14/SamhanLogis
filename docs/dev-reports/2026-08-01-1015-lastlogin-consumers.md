# 2026-08-01 `lastLoginAt` 데이터 소비처 조사

## 조사 범위와 1차 식별

- 저장 컬럼은 최소 두 도메인에 존재한다. 거래처 인증은 `services/partner-auth-service/src/main/resources/db/migration/V1__init_partner_auth.sql:17`의 `partner_auth.last_login_at`, 내부 계정 인증은 `services/auth-service/src/main/resources/db/migration/V1__init_account.sql:13`의 `account.last_login_at`이다.
- 이번 장기미사용 복구가 갱신하는 대상은 거래처 인증 엔티티의 값이다. `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:207`에서 복구 시 현재 시각을 기록한다. 내부 계정용 `Account.lastLoginAt`에는 이 복구 값이 유입되지 않는다.

## 확인 결과 누적

### 1. 도메인 만료 계산

- 직접 읽는 운영 코드의 핵심은 `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:242-245`이다. `lastLoginAt`이 있으면 그것을, 없으면 `passwordChangedAt`을 기준으로 30일 뒤를 반환한다.
- 이 소비처는 값을 화면용 "마지막 접속"이 아니라 **만료 기준시각**으로 해석한다. 복구 시각이 들어오면 복구 시점부터 30일 뒤가 새 만료일이 되므로, 복구 직후 재선별을 막으려는 현재 수정 목적과 일치한다.

### 2. 상태 조회와 로그인 차단

- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:104-113`은 위 만료일을 현재 시각과 비교해 유효 상태를 `LONG_UNUSED`로 해석한다. 같은 평가는 로그인 처리에서도 비밀번호 검증 전에 호출되고, 만료이면 차단한다(`PartnerAuthService.java:202-218`).
- 따라서 복구 시각은 두 경로 모두에서 "실제 마지막 로그인"이 아니라 **접근 만료 타이머의 시작점**이 된다. 현재 로직의 목적에는 맞으며 이 두 소비처 자체에는 의미 혼용 문제가 없다.

### 3. 만료 API와 주문서 앱 표시

- `GET /api/v1/auth/partner-expiration`은 `PartnerAuthService.java:363-374`에서 같은 계산 결과를 `expiresAt`, `expiredAlready`, `remainingDays`로 변환하고, `PartnerAuthController.java:84-87`이 외부에 노출한다. 응답 계약도 마지막 로그인값 자체가 아니라 만료일이다(`ExpirationResponse.java:5-15`).
- 주문서 앱은 이 API를 호출한다(`clients/web/order-app/src/samhanApi.ts:306`)고 확인됐다. 실제 화면은 응답의 `expiresAt`을 그대로 사용기한 텍스트로 표시한다(`clients/web/order-app/index.html:8602-8607`). 다만 이 폴링은 로그인 완료 뒤 시작되고(`:8579-8594`), 성공 로그인은 먼저 `lastLoginAt`을 다시 로그인 시각으로 덮어쓴다(`PartnerAuthService.java:249-250`). 따라서 복구된 거래처가 실제 화면에 들어온 뒤 보는 값은 통상 **실제 로그인 시각 + 30일**이다. API를 복구 후 로그인 전에 직접 호출한 경우에만 복구 시각 + 30일이 응답된다. 어느 경우든 표시 라벨이 사용기한이므로 문제 없음이다.
- 실제 화면 진입 후 환영 동작에서 폴링을 시작하고(`clients/web/order-app/index.html:8579-8594`), 즉시 조회 후 30분마다 갱신한다(`clients/web/order-app/index.html:8614-8617`). 표시 라벨은 "주문서 사용기한"이다(`clients/web/order-app/index.html:782-784`). 즉 문자열 검색만으로 추정한 것이 아니라 실제 화면 호출·표시 경로가 연결돼 있다.
- 별개로 상태조회에서 `LONG_UNUSED`를 받으면 화면은 "마지막 로그인일(로그인 기록이 없으면 비밀번호 변경일)로부터 30일간"이라고 안내한다(`clients/web/order-app/index.html:8299-8305`). 복구 후 실제 로그인을 한 번도 하지 않고 다시 30일이 지난 거래처에서는 계산 기준이 복구일인데 화면은 이를 마지막 로그인일이라고 설명한다. **시각 원문을 표시하지 않더라도 의미를 '마지막 로그인'으로 번역하는 소비처이므로 문제 있음**이다. 비밀번호 입력 뒤 로그인 응답의 다른 `LONG_UNUSED` 모달은 구체 날짜 의미를 쓰지 않는다(`:8496-8503`).

### 4. 장기미발주 관리 화면

- 실제 관리 라우트는 `/sales/order-approvals`이며 VIEW 권한으로 감싸져 있다(`clients/desktop/src/renderer/routes/index.tsx:503-512`). 판매 하위 메뉴에도 실제 링크가 있다(`clients/desktop/src/renderer/components/sales/SalesSubNav.tsx:20-24`).
- 화면은 `GET /api/v1/partner-approvals`를 호출한다(`clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:72-79`, `clients/desktop/src/renderer/api/sales.ts:1032-1047`). 응답 row 계약에는 상태·승인요청일·튜토리얼·담당자만 있고 `lastLoginAt`은 없다(`clients/desktop/src/renderer/api/sales.ts:1015-1030`). 실제 열도 같은 필드들뿐이다(`SalesOrderApprovalsPage.tsx:121-206`). 따라서 복구 시각이나 마지막 로그인 시각은 이 화면에 표시되지 않는다.
- backend 목록도 저장된 `status`로만 필터링한다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:41-50`, `PartnerAuthRepository.java:19-24`). 응답 변환은 `createdAt`을 승인요청일로 쓰고 상태 등을 내보낼 뿐 `lastLoginAt`을 읽지 않는다(`PartnerApprovalResponse.java:46-59`).
- 결론적으로 장기미발주 관리 화면은 `lastLoginAt`의 **직접 소비처가 아니다**. 다만 로그인 시 만료 평가가 저장 상태를 `LONG_UNUSED`로 바꾸면(`PartnerAuthService.java:202-205`) 그 상태가 간접적으로 화면의 `장기미발주`가 된다. 복구 시에는 상태가 `NEED_PW_INPUT`으로 바뀌어(`PartnerAuth.java:200-207`) 화면상 `승인` 그룹으로 보인다(`PartnerApprovalService.java:109-117`).

### 5. 실제 로그인 갱신과 구별 가능성

- 실제 거래처 로그인 성공 시각 갱신은 `PartnerAuthService.java:235-252`의 비밀번호 검증 성공 경로에서 `markLoginSuccess(LocalDateTime.now())`를 호출하고, `PartnerAuth.java:172-179`가 `lastLoginAt`을 대입하는 지점이다.
- 같은 성공 경로는 `partner_login_attempt`에 `SUCCESS` 이벤트를 저장한다(`PartnerAuthService.java:249-252`). 이 이벤트에는 독립 `attemptedAt`이 있다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerLoginAttempt.java:45-69`; 스키마는 `V1__init_partner_auth.sql:46-68`). 이어서 세션의 `issuedAt`도 기록한다(`PartnerAuthService.java:254-267`; 스키마는 `V1__init_partner_auth.sql:77-106`).
- 복구 경로는 `PartnerApprovalService.java:53-77`에서 `restoreFromLongUnused()`만 호출하고 로그인 시도 또는 세션을 만들지 않는다. 따라서 **`partner_auth.last_login_at` 값 하나만 보면 로그인과 복구를 구별할 수 없다**. 다만 별도 로그인 성공 이벤트/세션과 대조하면 실제 로그인 여부를 사후 판별할 근거는 있다.

### 6. 별도 시각 컬럼 존재 여부

- `partner_auth` 자체에는 `password_changed_at` 외에 복구 또는 상태변경 전용 시각 컬럼이 없다. 전체 스키마 열은 `services/partner-auth-service/src/main/resources/db/migration/V1__init_partner_auth.sql:9-30`에 확인된다.
- 상속 필드 `modified_at`/`modified_by`는 존재한다(`shared/common/src/main/java/com/samhanair/logis/common/entity/BaseEntity.java:28-34`). 그러나 모든 엔티티 변경에 덮어써지는 일반 수정 감사값이어서 복구 기준시각으로 재사용하면 이후 로그인 실패 횟수, 비밀번호 변경, 튜토리얼 변경 등 다른 수정에도 의미가 바뀔 수 있다. 복구 전용 기준으로는 부적합하다.
- `partner_login_attempt.attempted_at`과 `partner_session.issued_at`은 실제 로그인 활동을 식별하는 별도 시각이지만(`V1__init_partner_auth.sql:46-68`, `V1__init_partner_auth.sql:77-106`), 복구 시각을 담지 않는다. 즉 **이미 있는 컬럼 중 복구/상태변경 기준으로 그대로 대체할 적합한 컬럼은 없다**.

### 7. 리포트·SQL 소비처

- 기존 영향도 보고서는 원시 `last_login_at`을 직접 조회해 열 이름 그대로 출력한다(`docs/dev-reports/2026-08-01-1015-impact-count.md:179-200`). 이 출력은 고정된 과거 스냅샷이라 이번 코드 변경으로 내용이 바뀌지는 않는다. 그러나 복구 후 같은 SQL을 다시 실행하면 복구 시각이 `last_login_at` 열에 나타나므로 이를 실제 로그인 시각으로 읽으면 잘못이다.
- 같은 보고서의 비교 SQL은 `COALESCE(last_login_at, password_changed_at)`을 현행 선별 기준으로 사용한다(`2026-08-01-1015-impact-count.md:305-315`, `394-418`). 복구 값이 들어오면 현행 선별에서는 복구 이후 해당 cutoff까지 최근 활동으로 취급된다. 이 SQL의 목적은 **현행 만료 기준 재현**이므로 계산상 문제 없음이다.
- 다만 비교 결과 출력은 `last_login_at`을 그대로 표시한다(`2026-08-01-1015-impact-count.md:410-429`), 보고서 해석도 당시 표본을 "최근 로그인했다"고 표현한다(`:455-459`). 향후 복구된 행이 포함되면 값만으로 실제 로그인을 단정할 수 없으므로 이 해석은 문제 있음이다. 실제 로그인 여부는 `partner_login_attempt.result=SUCCESS` 또는 세션 발급 이력과 대조해야 한다.
- `docs/dev-reports/2026-08-01-1015-order-app-access-recon.md:70-73`은 만료 기준 소비를 정확히 설명하지만, `:71`의 "로그인 성공 때만 갱신"은 이번 복구 수정 후 더 이상 사실이 아니다. 이 문서는 실행 소비처는 아니지만 현재 의미를 설명하는 리포트로서는 복구 값을 실제 로그인으로 오해하게 만드는 오래된 서술이다.
- `docs/dev-reports/2026-08-01-1015-sol-review.md:13-15`은 수정 전 결함의 과거 증거이고, `docs/dev-reports/2026-08-01-1015-slice1-fix.md:33-35`는 복구가 `lastLoginAt`을 갱신하도록 바뀐 사실을 명시한다. 전자는 역사적 보고서 문맥에서는 유지 가능한 과거 상태이며, 후자는 현재 동작과 일치한다.

### 8. 테스트·QA 문서 및 동명 필드 제외

- 서비스 테스트는 로그인 성공 뒤 `getLastLoginAt()`이 채워졌는지 확인한다(`services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceTest.java:171-186`). 이 테스트는 호출 직전에 실제 로그인 성공 경로를 실행하므로 해당 단언 자체는 여전히 맞지만, 필드 전역 의미가 "로그인만"이라고 보장하지는 않는다.
- 주문서 앱 회귀 테스트는 문제로 판정한 "마지막 로그인일(로그인 기록이 없으면 비밀번호 변경일)" 문구의 존재를 명시적으로 고정한다(`clients/web/order-app/src/__tests__/longUnusedMessage.test.ts:9-14`). 따라서 현재 의미 혼용은 테스트가 놓친 우연한 화면 문자열이 아니라 현행 계약으로 고정된 상태다.
- 만료·복구 테스트는 값을 실제 접속 표시가 아닌 만료 기준으로 주입·소비한다(`PartnerAuthServiceTest.java:197-239`, `:502-519`; `PartnerApprovalServiceTest.java:20-37`). 복구 값이 들어오는 현재 의미와 일치하므로 문제 없음이다.
- 과거 QA 보고서들은 실제 로그인 요청 수행 직후 DB 값을 읽었다고 명시한다(`docs/qa/985-confirm-price-live/REPORT.md:19-24`, `R2-REPORT.md:13-18`, `R3-REPORT.md:13-19`). 고정된 당시 증거로는 실제 로그인 시각이 맞고 이번 수정으로 과거 내용이 변하지 않는다. `R4-REPORT.md:10-16`은 인증 row가 없음을 확인한 SQL일 뿐 값 소비가 아니다.
- `services/auth-service/.../Account.java:75-76`과 `V1__init_account.sql:13`의 동명 필드는 내부 직원 계정용이다. 갱신은 내부 로그인 `Account.java:172-175`에서만 일어나고, 거래처 복구 경로와 데이터베이스가 다르므로 이번 복구 값은 유입되지 않는다. 해당 getter의 운영 소비는 검색되지 않았고 테스트 확인만 있다(`services/auth-service/src/test/java/com/samhanair/logis/auth/service/AuthServiceTest.java:116`).
- `docs/manual/inventory/backend-feature-inventory.md:98-113`의 `last_login_at`도 위 내부 계정 인증 설명이다. 거래처 복구 값의 소비처가 아니다.
- `docs/qa/arologis-extract/scenarios.md:91-101,221-224`와 `regression-33-case.md:248-272`의 SQL은 독립 운영 단위 아로로지스의 관리자/기사 인증 테이블을 대상으로 한다. partner-auth 복구 값이 유입되지 않는다. `scripts/generate-arologis-qa-screenshots.ps1:244`와 `docs/uiux/arologis-extract/02-desktop-driver-mgmt.md:156,214`의 "마지막 로그인" 화면 설계도 같은 별도 도메인이다.
- partner-auth-service의 migration은 V1과 V2뿐이며, 복구·상태변경 시각 후보 검색 결과 V1의 일반 `modified_at`과 로그인 시도 `attempted_at` 외 전용 컬럼은 없다(`services/partner-auth-service/src/main/resources/db/migration/V1__init_partner_auth.sql:23-30,46-68`; V2는 partner code unique 변경만 담당).

## 소비처 판정표

| 소비처 (`파일:행번호`) | 그 값을 무엇으로 쓰는가 | 복구로 갱신된 값이 들어오면 | 문제 있음 / 없음 |
|---|---|---|---|
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:242-245` | 30일 만료 기준시각 | 복구 시점 + 30일을 만료일로 계산 | 없음 — 소비 의미가 만료 기준임 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:104-113,202-218` | 상태조회·로그인 전 장기미사용 판정 | 복구 후 30일 동안 재차단하지 않음 | 없음 — 현재 복구 목적과 일치 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:363-374` 및 `dto/ExpirationResponse.java:5-15` | 외부에 만료일·만료 여부·잔여일 제공 | 복구 시각 기준의 새 사용기한 제공 | 없음 — '마지막 로그인'이 아니라 만료 정보 계약 |
| `clients/web/order-app/index.html:782-784,8579-8617` | 로그인 완료 뒤 `expiresAt`을 "주문서 사용기한"으로 화면 표시 | 실제 화면에서는 성공 로그인이 다시 갱신한 로그인 시각 + 30일이 보임 | 없음 — 표시 의미가 만료일과 일치 |
| `clients/web/order-app/index.html:8299-8305` | `LONG_UNUSED`의 기준을 "마지막 로그인일(없으면 비밀번호 변경일)"이라고 사용자에게 설명 | 실제 로그인 없이 복구 후 재만료되면 복구일을 마지막 로그인일처럼 뜻하게 됨 | **있음 — 마지막 접속과 만료 기준 의미 혼용** |
| `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:72-79,121-206` 및 `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:41-50,109-117` | 원시 시각이 아니라 저장 상태를 조회·표시 | 복구된 행은 `승인` 상태로 보이고 복구/로그인 시각은 보이지 않음 | 없음 — `lastLoginAt` 직접 소비처 아님 |
| `docs/dev-reports/2026-08-01-1015-impact-count.md:305-315,394-418` | 현행 선별 알고리즘 재현용 만료 기준 | 복구 이후 cutoff까지 최근 기준으로 취급 | 없음 — 계산 목적에는 맞음 |
| `docs/dev-reports/2026-08-01-1015-impact-count.md:179-200,410-429,455-459` | 원시 `last_login_at` 출력 및 "최근 로그인" 해석 | 복구일이 로그인일처럼 출력·해석될 수 있음 | **있음 — 실제 로그인 단정 불가** |
| `docs/dev-reports/2026-08-01-1015-order-app-access-recon.md:70-73` | 현행 기준과 갱신 원천 설명 | `:71`의 "로그인 성공 때만 갱신"이 거짓이 됨 | **있음 — 현재 코드와 불일치한 리포트 설명** |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceTest.java:171-239,502-519` 및 `PartnerApprovalServiceTest.java:20-37` | 로그인 성공 결과 확인 또는 만료 기준 테스트 | 각 테스트의 문맥 안에서는 실제 로그인/만료 기준을 구별함 | 없음 — 단, 필드 자체의 단일 의미를 보장하지는 않음 |
| `docs/qa/985-confirm-price-live/REPORT.md:19-24`, `R2-REPORT.md:13-18`, `R3-REPORT.md:13-19` | 실제 로그인 요청 직후의 고정 QA 증거 | 과거 캡처 값은 그대로 실제 로그인 결과 | 없음 — 향후 일반 조회 해석에는 재사용 불가 |

## 결론

- 현재 운영 코드에서 거래처 `lastLoginAt`의 실질적 주 소비 의미는 **"마지막 접속"이 아니라 30일 접근 만료 기준시각**이다. 복구 수정은 이 소비 의미에는 맞는다.
- 그러나 필드명·엔티티 설명(`PartnerAuth.java:89-91`), 주문서 앱 안내(`clients/web/order-app/index.html:8299-8305`), 일부 리포트 해석은 이를 **실제 마지막 로그인**으로 취급한다. 복구가 생산한 값이 들어오는 순간 한 컬럼에 두 뜻이 섞인다.
- 원시 값 자체를 그대로 화면에 표시하는 운영 화면은 확인되지 않았다. 화면 노출은 (1) 복구일 + 30일인 "주문서 사용기한", (2) 원시 날짜 없이 "마지막 로그인일로부터 30일"이라는 설명이다. 전자는 정확하고 후자는 복구 거래처에서 부정확하다.
- 기존 `modifiedAt`은 일반 변경 시각이라 만료 기준으로 부적합하고, 로그인 시도 `attemptedAt`/세션 `issuedAt`은 실제 로그인 증거이지만 복구 기준을 담지 않는다. 따라서 기존 별도 컬럼을 재사용하는 안보다 **실제 로그인 시각은 `lastLoginAt`에 보존하고, 만료 전용 기준시각(개념상 `accessBaselineAt`/`expirationBaselineAt`)을 분리하는 편이 의미상 맞다**. 로그인 성공은 실제 로그인과 만료 기준을 함께 갱신하고, 복구는 만료 기준만 갱신하는 모델이면 두 뜻을 구별할 수 있다.
- 이번 라운드에서는 판단만 했으며 코드·스키마는 수정하지 않았다. DB 조회도 새로 실행하지 않았고, 인용한 SQL/출력은 기존 읽기 조사 보고서의 고정 원문이다.
