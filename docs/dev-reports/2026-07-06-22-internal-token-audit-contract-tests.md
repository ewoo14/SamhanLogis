# 2026-07-06 — #22(#587·#531) X-Internal-Token audit + RestClient 계약테스트

> 최근 #25(X-Is-System-Master 누락), #26(URL 불일치), #720 계열에서 서비스간 client 결함이 반복되어 PR #746 dev 범위에서 내부 호출 계약을 재점검했다.

## 라운드1 리뷰 fix (2026-07-06, Opus 5-agent)

최초 audit(아래 "Audit 결과" 표)은 `PartnerAuthClient`를 "결함 없음"으로 기록했으나, 실제로는 실 수신 계약과 불일치하는 진짜 결함이 있었다. 아래 3건을 이번 라운드에서 수정했다 — **fix는 본 PR 내에서 처리**(별도 PR/이슈 분리 없음, memory `feedback_fix_in_current_pr_no_split`).

1. **`PartnerAuthClient` 실계약 불일치(발견 시 실제 결함)** — audit 표는 대상 서비스를 `auth-service`, URI를 `/internal/partner-auth/*`로 잘못 기록했다. 실제 대상은 `partner-auth-service`(8091)이며 URI도 `/internal/*`가 아니다:
   - `GET /api/v1/auth/partner-status` — 수신측 `PartnerAuthController.partnerStatus(@RequestParam bizNo)`는 쿼리 파라미터로 **bizNo**(사업자등록번호)를 요구하는데, client는 `partnerCode`를 전송했다.
   - `PATCH /api/v1/auth/partner-tutorial` — 수신측 `TutorialUpdateRequest(bizNo, platform, done)` 계약인데, client는 `{partnerCode, completed}`를 전송했다.
   - fix: `PartnerAuthClient.verifyPartner`/`patchTutorialState`를 bizNo 기반 계약으로 정정. 호출측 `TutorialStateService.patch`가 `PartnerLookupClient.findByPartnerCode`로 partnerCode → bizNo를 해소해 전달하도록 조정(플랫폼은 legacy PC 발주 mirror 전용이라 `PLATFORM_PC` 고정, bizNo 미해소 시 M2 proxy skip + local mirror만 갱신하는 fail-soft).
2. **`PartnerMig8LookupClient` 누락(audit 표에 client 자체가 빠짐) + 실제 결함** — `GET /internal/partners/{id}/summary` 응답을 파싱해 bizCode를 찾으나, 수신측 `PartnerInternalResponse(partnerId, partnerCode, name, creditLimit, outstandingBalance, status)`에 사업자등록번호 필드 자체가 없어 **파싱이 100% 실패**했다(MIG-8 partner-order 이식이 partner lookup miss로 전건 reject). 기존 `Mig8OrderImportServiceIT`는 이 client를 `@MockBean`으로 완전히 우회해 실 파싱 경로가 한 번도 검증되지 않았다.
   - fix: partner-service `PartnerInternalResponse`에 `bizNo` 필드 신규 추가(`Partner.bizNo`로 채움). `PartnerMig8LookupClient`의 별칭 키 나열(`businessNo`/`businessRegistrationNumber`/`businessRegistrationNo`/`bizCode`/`bizNo`)을 실 계약 키 `bizNo` 단일 조회로 정리.
3. **동일 결함 패밀리 sweep — `PartnerLookupClient`(vendor, partner-order-service)** — 같은 `PartnerInternalResponse`를 소비하는 `GET /internal/partners/{partnerCode}` client도 `businessNo`/`businessRegistrationNumber` 별칭만 조회해 `PartnerSummary.businessNo()`가 항상 null이었다. 이 client는 `TutorialStateService`의 bizNo 해소 경로에 직접 사용되므로 방치 시 위 1번 fix가 무력화된다. `bizNo` 단일 조회로 정정.

정정 대상 감사표/계약테스트 표는 아래 "Audit 결과"·"추가 계약테스트"에 직접 반영했다(원본 오기를 그대로 보존하는 대신 정정하되, 정정 이력은 본 절에 남긴다).

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
| partner-order | `PartnerAuthClient` | `partner-auth-service` `GET /api/v1/auth/partner-status?bizNo=` + `PATCH /api/v1/auth/partner-tutorial`(`TutorialUpdateRequest{bizNo,platform,done}`) + `X-Internal-Token` | **[정정, 라운드1]** 최초 audit은 대상 서비스(`auth-service`)·URI(`/internal/partner-auth/*`)를 잘못 기록했고 "결함 없음"도 오판이었다. 실제로는 쿼리 파라미터(partnerCode→bizNo)와 바디 계약({partnerCode,completed}→{bizNo,platform,done}) 모두 불일치하는 진짜 결함. fix + 계약테스트 정정. |
| partner-order | `PartnerMig8LookupClient` | `partner-service` `GET /internal/partners/{id}/summary`(`PartnerInternalResponse`) + `X-Internal-Token` | **[신규 추가, 라운드1 — 최초 audit 누락]** 수신측 `PartnerInternalResponse`에 사업자등록번호 필드가 없어 bizCode 파싱이 항상 실패(MIG-8 이식 100% partner lookup miss reject). partner-service `PartnerInternalResponse`에 `bizNo` 필드 추가로 해소. 계약테스트 신규 추가(`@MockBean` 우회 없음). |
| partner-order | `PartnerLookupClient`(vendor) | `partner-service` `GET /internal/partners/{partnerCode}`(`PartnerInternalResponse`) + `X-Internal-Token` | **[라운드1 sweep — 동일 결함 패밀리]** 위와 같은 `PartnerInternalResponse`를 소비하나 `businessNo`/`businessRegistrationNumber` 별칭만 조회해 `PartnerSummary.businessNo()`가 항상 null. `TutorialStateService`의 bizNo 해소 경로가 본 client에 의존하므로 직접 연쇄 영향 — `bizNo` 단일 조회로 정정. 계약테스트 신규 추가. |
| partner-order | `InventoryClient`, `SlipServiceClient` | 재고/슬립 내부 호출 + `X-Internal-Token` + `X-Is-System-Master` | #25 계열 헤더 보존 확인. 기존 계약테스트 존재. |
| partner-order | `ApprovalLineAuthorizeClient`, `DcConfigClient`, `EstimateCatalogClient`, `ProductClient`, `AccountingMig8OrderClient`, `ProductCatalogLookupClient` | 기존 내부 client 계약 | 기존 `MockRestServiceServer` 계약테스트 존재 확인. |
| partner-service | `PartnerInternalResponse`(DTO, client 아님) | `PartnerInternalController` 3개 endpoint(`/internal/partners/{partnerCode}`, `/by-name`, `/{id}/summary`)의 공통 응답 DTO | **[라운드1 서버측 fix]** 위 두 partner-order client 결함의 근본 원인 — 사업자등록번호 필드 부재. `bizNo` 필드 신규 추가(`Partner.bizNo`로 채움, NULLable 아닌 필수 컬럼 값이므로 마이그레이션 불요). `PartnerInternalControllerIT`에 `bizNo` 회귀 가드 assertion 추가. |
| notification | `RestClientPartnerLookupClient` | `partner-service` 내부 조회 + `X-Internal-Token` | 기존 계약테스트 존재 확인. |
| notification | `SlipServiceClient` | 현재 인터페이스 + `NoopSlipServiceClient`만 존재 | 실제 `RestClient` 구현 부재로 신규 계약테스트 대상 아님. |
| notification | `UserClient` | shared `DefaultUserVerifier` 위임 | 로컬 `RestClient` 구현이 아니므로 신규 계약테스트 대상 아님. |

최초 audit은 "생산 코드 계약 결함은 발견하지 못했다"고 결론지었으나 **오판이었다** — 위 표에 정정 표시([정정]/[신규 추가]/[sweep]/[서버측 fix])한 3+1건이 실제 계약 결함이었다(라운드1, Opus 5-agent 리뷰로 적발). 이번 라운드에서 모두 fix + 실 계약 기준 테스트로 보강했다. 나머지 client는 여전히 결함 없음으로 확인된다.

## 추가 계약테스트

| 모듈 | 테스트 | 검증 계약 |
|---|---|---|
| accounting | `AuthAccountLookupClientTest` | 계정 조회 URI, `X-Internal-Token`, 성공 응답 파싱, 404 null 처리, blank token 요청 차단 |
| accounting | `NotificationClientTest` | 알림 전송 URI, `X-Internal-Token`, JSON body, 2xx 성공, 4xx false, blank token 요청 차단 |
| slip | `AuthAccountLookupClientTest` | 계정 조회 URI, `X-Internal-Token`, 성공 응답 파싱, 4xx null 처리, blank token 요청 차단 |
| slip | `NotificationClientTest` | 알림 전송 URI, `X-Internal-Token`, JSON body, 2xx 성공, 4xx false, blank token 요청 차단 |
| partner-order | `AuthAccountLookupClientTest` | 계정 조회 URI, `X-Internal-Token`, 성공 응답 파싱, 404 null 처리, blank token 요청 차단 |
| partner-order | `NotificationClientTest` | 알림 전송 URI, `X-Internal-Token`, JSON body, 2xx 성공, 4xx false, blank token 요청 차단 |
| partner-order | `PartnerAuthClientTest` | **[라운드1 정정]** bizNo 상태조회/튜토리얼(bizNo,platform,done) URI+body, `X-Internal-Token`, 2xx/4xx/5xx 상태 매핑, blank token 요청 차단(신규) |
| partner-order | `PartnerMig8LookupClientTest` | **[라운드1 신규]** `partner-service` 실 `PartnerInternalResponse.bizNo` 파싱(성공/미존재/404/401/blank token) — `@MockBean` 우회 없음 |
| partner-order | `PartnerLookupClientTest`(vendor) | **[라운드1 신규]** `partner-service` 실 `PartnerInternalResponse.bizNo` → `PartnerSummary.businessNo()` 파싱(성공/404/blank token) — `@MockBean` 우회 없음 |
| partner-order | `TutorialStateServiceTest` | **[라운드1 신규]** partnerCode→bizNo 해소 성공 시 M2 proxy(bizNo,PC,completed) 호출, 해소 실패 시 M2 proxy skip + local mirror만 갱신 |
| partner-service | `PartnerInternalControllerIT`(기존 확장) | **[라운드1]** `lookup`/`summary` 응답에 `bizNo` 필드 회귀 가드 assertion 추가 |

## RED 실증

- URL 회귀: `accounting-service` `NotificationClient`의 `SEND_PATH`를 `/internal/notifications`로 임시 변경하면 `NotificationClientTest.sendsPushBodyWithInternalToken`가 `NotificationClientTest.java:50`에서 실패함을 확인했다.
- 헤더 회귀: 같은 client에서 `X-Internal-Token` 전송을 임시 삭제하면 동일 테스트가 `NotificationClientTest.java:50`에서 실패함을 확인했다.
- 두 RED 실증 후 소스는 정상 계약(`/internal/notifications/send`, `X-Internal-Token`)으로 복구했다.

### 라운드1 신규 RED 실증

- **`PartnerAuthClient` bizNo 계약**: `verifyPartner`의 쿼리를 `bizNo={b}`→`partnerCode={b}`로, `patchTutorialState`의 바디를 `{bizNo,platform,done}`→`{partnerCode,completed}`로 임시 되돌린 뒤 `PartnerAuthClientTest`를 실행하면 5건 중 3건(`verifyPartnerSendsInternalTokenAndBizNoQueryAndParsesStatusEnvelope`, `verifyPartnerMaps4xxToForbiddenAnd5xxToInternalError`, `patchTutorialStateSendsInternalTokenAndBizNoPlatformDoneBodyButIsFailSoft`)이 URI 불일치/`PathNotFoundException($.platform)`으로 실패함을 확인했다(blank token 2건은 계약과 무관해 영향 없음). 이후 정상 계약으로 복구해 5건 전부 GREEN 확인.
- **`PartnerInternalResponse.bizNo` 신규 필드**: `bizNo` 컴포넌트를 임시 제거한 뒤 `PartnerInternalControllerIT`를 실행하면 `lookup_with_valid_token_returns_partner_master_with_uuid`, `get_summary_by_partner_id_returns_200` 2건이 `PathNotFoundException($.data.bizNo)`으로 실패함을 확인했다(24건 중 2건 실패, 나머지 22건은 무관하여 GREEN 유지). 이후 필드를 복구해 24건 전부 GREEN 확인.
- 두 RED 실증 모두 임시 되돌림 → 실패 확인 → 원복 → 전체 재실행 GREEN 확인 순으로 진행했다(git 미사용, Edit 도구로만 토글).

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

### 라운드1 fix 검증 (2026-07-06)

| 명령 | 결과 |
|---|---|
| `./gradlew :services:partner-order-service:compileJava :services:partner-auth-service:compileJava :services:partner-service:compileJava` | 성공 |
| `./gradlew :services:partner-order-service:test :services:partner-auth-service:test :services:partner-service:test --rerun-tasks --no-build-cache --no-parallel` | 성공 — partner-order-service 347건 / partner-auth-service 45건 / partner-service 292건, 합계 684건 0 fail·0 error·0 skip |
| RED 실증 2건(위 "라운드1 신규 RED 실증") 후 원복 + 전체 재실행 | 성공 — 684건 전부 GREEN 재확인 |

partner-auth-service(수신측)는 이번 라운드에서 코드 변경이 없다 — `PartnerAuthClient`/`PartnerMig8LookupClient`/`PartnerLookupClient`(vendor)가 이미 확정된 수신 계약(`PartnerAuthController`, `TutorialUpdateRequest`, `PartnerInternalResponse`)에 맞춰 정합했다. Flyway 마이그레이션 추가 없음(`bizNo`는 `Partner` 엔티티의 기존 NOT NULL 컬럼 값을 노출만 하는 DTO 필드 추가라 스키마 변경 불요).

### 참고 — 스코프 외 관찰 (별도 fix 아님)

accounting-service의 기존 `PartnerLookupClient`는 파싱 키 우선순위가 이미 `bizNo`를 최우선으로 조회하고 있어(`textOrNull(data, "bizNo", "businessNo", "businessRegistrationNumber")`), 이번 `PartnerInternalResponse.bizNo` 추가로 별도 코드 수정 없이 정상 동작하게 되는 부수 효과가 있다. 다만 accounting-service의 기존 `PartnerLookupClientTest`는 자체 작성 fixture(`"bizNo"` 키 포함)로 client 파싱 로직만 검증하고 실제 partner-service 응답 계약과는 대조하지 않았던 것으로 보인다 — 즉 이번 라운드 이전에는 "결함 없음"으로 audit 되었으나 실제로는 동일한 근본 원인(서버 DTO에 bizNo 부재)의 영향을 받고 있었을 가능성이 있다. accounting-service는 본 리뷰 지적 범위 밖이라 코드 변경은 하지 않았고, PM/후속 라운드에서 확인이 필요하다.
