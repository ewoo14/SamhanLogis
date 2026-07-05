# 2026-07-06 — #22(#587·#531) X-Internal-Token audit + RestClient 계약테스트

> 최근 #25(X-Is-System-Master 누락), #26(URL 불일치), #720 계열에서 서비스간 client 결함이 반복되어 PR #746 dev 범위에서 내부 호출 계약을 재점검했다.

## 스코프

- #587 audit: `X-Internal-Token`, `INTERNAL_TOKEN_HEADER`, `requireToken`, `SAMHAN_*_SERVICE_URL` 기반 서비스간 `RestClient`를 점검하고 수신 컨트롤러의 실제 URI, 헤더, body 계약과 대조했다.
- #531 계약테스트: 계약테스트가 없던 우선순위 client에 `MockRestServiceServer` 테스트를 추가했다. `@MockBean` 우회는 사용하지 않았고, URI/헤더/body/상태 매핑을 실 요청 수준에서 검증했다.
- 우선순위 모듈: `accounting-service`, `slip-service`, `partner-order-service`, `notification-service`.

## Audit 결과

| 모듈 | Client | 수신 계약 | 감사 결과 |
|---|---|---|---|
| accounting | `AuthAccountLookupClient` | `auth-service /internal/accounts/by-username/{username}` + `X-Internal-Token` | 결함 없음. 계약테스트 신규 추가. |
| accounting | `NotificationClient` | `notification-service /internal/notifications/send` + `X-Internal-Token` + 알림 body | 결함 없음. 계약테스트 신규 추가. |
| accounting | `ApprovalLineAuthorizeClient`, `ChatRoomMappingClient`, `EmployeeLookupClient`, `PartnerLookupClient`, `ProductAliasClient`, `ProductClient`, `SlipQueryClient`, `SlipServiceClient` | 기존 내부 client 계약 | 기존 `MockRestServiceServer` 계약테스트 존재 확인. |
| slip | `AuthAccountLookupClient` | `auth-service /internal/accounts/by-username/{username}` + `X-Internal-Token` | 결함 없음. 계약테스트 신규 추가. |
| slip | `NotificationClient` | `notification-service /internal/notifications/send` + `X-Internal-Token` + 알림 body | 결함 없음. 계약테스트 신규 추가. |
| slip | `InventoryClient` | 재고 내부 출고/입고 호출 + `X-Internal-Token` + `X-Is-System-Master` | #25 계열 헤더 보존 확인. 기존 계약테스트 존재. |
| slip | `ApprovalLineAuthorizeClient`, `ArologisDispatchClient`, `NotificationChatRoomClient`, `PartnerBlockClient`, `PartnerInternalClient`, `ProductClient`, `UserInternalClient`, `WarehouseInternalClient` | 기존 내부 client 계약 | 기존 `MockRestServiceServer` 계약테스트 존재 확인. |
| partner-order | `AuthAccountLookupClient` | `auth-service /internal/accounts/by-username/{username}` + `X-Internal-Token` | 결함 없음. 계약테스트 신규 추가. |
| partner-order | `NotificationClient` | `notification-service /internal/notifications/send` + `X-Internal-Token` + 알림 body | 결함 없음. 계약테스트 신규 추가. |
| partner-order | `PartnerAuthClient` | `auth-service /internal/partner-auth/*` + `X-Internal-Token` | 결함 없음. 계약테스트 신규 추가. |
| partner-order | `InventoryClient`, `SlipServiceClient` | 재고/슬립 내부 호출 + `X-Internal-Token` + `X-Is-System-Master` | #25 계열 헤더 보존 확인. 기존 계약테스트 존재. |
| partner-order | `ApprovalLineAuthorizeClient`, `DcConfigClient`, `EstimateCatalogClient`, `ProductClient`, `AccountingMig8OrderClient`, `ProductCatalogLookupClient` | 기존 내부 client 계약 | 기존 `MockRestServiceServer` 계약테스트 존재 확인. |
| notification | `RestClientPartnerLookupClient` | `partner-service` 내부 조회 + `X-Internal-Token` | 기존 계약테스트 존재 확인. |
| notification | `SlipServiceClient` | 현재 인터페이스 + `NoopSlipServiceClient`만 존재 | 실제 `RestClient` 구현 부재로 신규 계약테스트 대상 아님. |
| notification | `UserClient` | shared `DefaultUserVerifier` 위임 | 로컬 `RestClient` 구현이 아니므로 신규 계약테스트 대상 아님. |

생산 코드 계약 결함은 발견하지 못했다. 이번 변경은 누락된 계약테스트를 보강하고, 테스트용 `RestClient` 주입 생성자를 추가하면서 Spring 운영 생성자에는 `@Autowired`를 명시해 런타임 생성자 선택을 고정했다.

## 추가 계약테스트

| 모듈 | 테스트 | 검증 계약 |
|---|---|---|
| accounting | `AuthAccountLookupClientTest` | 계정 조회 URI, `X-Internal-Token`, 성공 응답 파싱, 404 null 처리, blank token 요청 차단 |
| accounting | `NotificationClientTest` | 알림 전송 URI, `X-Internal-Token`, JSON body, 2xx 성공, 4xx false, blank token 요청 차단 |
| slip | `AuthAccountLookupClientTest` | 계정 조회 URI, `X-Internal-Token`, 성공 응답 파싱, 4xx null 처리, blank token 요청 차단 |
| slip | `NotificationClientTest` | 알림 전송 URI, `X-Internal-Token`, JSON body, 2xx 성공, 4xx false, blank token 요청 차단 |
| partner-order | `AuthAccountLookupClientTest` | 계정 조회 URI, `X-Internal-Token`, 성공 응답 파싱, 404 null 처리, blank token 요청 차단 |
| partner-order | `NotificationClientTest` | 알림 전송 URI, `X-Internal-Token`, JSON body, 2xx 성공, 4xx false, blank token 요청 차단 |
| partner-order | `PartnerAuthClientTest` | 상태/튜토리얼 URI, `X-Internal-Token`, body, 2xx/4xx/5xx 상태 매핑, blank token 요청 차단 |

## RED 실증

- URL 회귀: `accounting-service` `NotificationClient`의 `SEND_PATH`를 `/internal/notifications`로 임시 변경하면 `NotificationClientTest.sendsPushBodyWithInternalToken`가 `NotificationClientTest.java:50`에서 실패함을 확인했다.
- 헤더 회귀: 같은 client에서 `X-Internal-Token` 전송을 임시 삭제하면 동일 테스트가 `NotificationClientTest.java:50`에서 실패함을 확인했다.
- 두 RED 실증 후 소스는 정상 계약(`/internal/notifications/send`, `X-Internal-Token`)으로 복구했다.

## 검증

| 명령 | 결과 |
|---|---|
| `.\gradlew :services:accounting-service:test --tests "com.samhanair.logis.accounting.client.AuthAccountLookupClientTest" --tests "com.samhanair.logis.accounting.client.NotificationClientTest" --rerun-tasks --no-build-cache --no-parallel` | 성공 |
| `.\gradlew :services:slip-service:test --tests "com.samhanair.logis.slip.client.AuthAccountLookupClientTest" --tests "com.samhanair.logis.slip.client.NotificationClientTest" --rerun-tasks --no-build-cache --no-parallel` | 성공 |
| `.\gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.client.AuthAccountLookupClientTest" --tests "com.samhanair.logis.partnerorder.client.NotificationClientTest" --tests "com.samhanair.logis.partnerorder.client.PartnerAuthClientTest" --rerun-tasks --no-build-cache --no-parallel` | 성공 |
| `.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache --no-parallel` | 성공 |
| `.\gradlew :services:slip-service:test --rerun-tasks --no-build-cache --no-parallel` | 성공 |
| `.\gradlew :services:partner-order-service:test --rerun-tasks --no-build-cache --no-parallel` | 성공 |

참고: 이 worktree에서는 여러 Gradle `test` 작업을 병렬 실행하면 공유 build output 경합으로 일시적인 missing class 오류가 발생할 수 있어, 최종 검증은 모두 `--no-parallel` 순차 실행으로 확정했다.
