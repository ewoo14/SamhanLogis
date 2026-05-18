# SP-09-2 BE 리뷰 — claude-be-cycle1

리뷰어: Claude BE Agent
대상 브랜치: feat/sp-09-2-aligo-sms-real-send (commit 87d1e5f7)
리뷰 유형: read-only cycle 1

---

## 1. 결함 분류

### CRITICAL — 없음

### HIGH

**H-BE-01: `saveSendAudit` 가 부모 `@Transactional` 트랜잭션 안에서 실행됨 — fail-soft 의도 위반 위험**

`DispatchBatchSendService.send()` 는 `@Transactional` 이 붙어 있고, `saveSendAudit()` 는 private 메서드로 같은 트랜잭션 내에서 호출된다. `saveSendAudit()` 가 catch 로 감싸져 있어 외부로 예외를 던지지 않으므로 fail-soft 동작 자체는 성립한다. 그러나 `dispatchSmsSaveHistoryService.save()` 내부를 보면 `saveInNewTransaction()` 이 `TransactionTemplate` 을 사용하여 PROPAGATION_REQUIRES_NEW 새 트랜잭션을 사용한다는 점을 확인해야 한다.

현재 `DispatchSmsSaveHistoryService.saveWithAutoLatestRetry` → `saveInNewTransaction` 구조이므로 SEND_AUDIT 모드에서는 새 트랜잭션으로 저장된다. 이는 올바른 설계이다. 다만 코드만 읽어서는 `saveInNewTransaction` 이 PROPAGATION_REQUIRES_NEW 임을 바로 확인하기 어렵다. **fail-soft + 트랜잭션 격리 두 조건 모두 성립한다는 주석이나 Javadoc 보강** 을 권장한다.

**H-BE-02: `isPlaceholder()` 에 contains 미적용 — 복합 문자열 placeholder 미탐지**

`AligoSmsAdapter.isPlaceholder()` 는 `equals` 로만 비교한다. SP-09-1 ETax 패턴과 일치한다고 커밋 메시지에 언급되어 있으나, ETax 패턴도 동일하게 equals 를 사용한다면 일관성은 유지된다. 단, `"CHANGE_ME_LOCAL_ONLY_EXTRA"` 같은 변형이나 공백 포함 형식은 탐지하지 못한다.

운영 리스크는 낮으나 방어적 코딩 관점에서 `lower.contains("change_me")` 등 contains 검사를 추가하는 것을 MEDIUM 권장 사항으로 제시한다. (SP-09-1 과 동시 변경 필요하므로 별도 슬라이스에서 처리 가능)

**H-BE-03: Spring IT — placeholder 런타임 가드 IT (`AligoSmsAdapterPlaceholderRuntimeGuardIT.java`, 패키지 `it`) 의 TC-1 ~ TC-3 이 조건부 실행 (if-block 내부)**

TC-1, TC-2, TC-3 이 모두 `if (isKeyPlaceholder)` / `if (isUseridPlaceholder)` 등 조건 분기 안에 있어 운영 key 주입 환경에서는 assertion 자체가 실행되지 않는다. 반면 단위 테스트(`adapter` 패키지 `AligoSmsAdapterPlaceholderRuntimeGuardIT`) 는 직접 프로퍼티를 조작하므로 이 문제가 없다. Spring IT 의 TC-1~3 은 **조건부 통과가 아닌 플래그 없는 무조건 assertion** 이 되어야 진정한 IT 가드 역할을 한다. 현재 구조는 CI 환경(placeholder key 설정)에서만 가드가 작동한다 — 운영 key 가 노출된 CI 환경에서 가드가 무력화된다.

### MEDIUM

**M-BE-01: `DispatchBatchAdminController.send()` — `X-User-Id` 헤더 `required = false`**

`required = false` 로 선언되어 있어 헤더 미전달 시 `userId = null` 이 `requestedBy` 로 전달된다. `DispatchSmsSaveHistoryService.save()` 의 `normalizeUser()` 가 null 을 처리하는지 확인 필요. `normalizeUser()` 내에서 null/blank 를 "anonymous" 등 기본값으로 치환하고 있다면 수용 가능하나, 감사 목적상 `requestedBy = null` 인 행이 DB 에 저장되는 것은 바람직하지 않다.

**M-BE-02: `result.getStatus().name().equals("SENT")` — 문자열 비교 대신 enum 직접 비교 권장**

`DispatchBatchSendService` 코드 111 라인에서 `result.getStatus().name().equals("SENT")` 로 status 를 판단한다. `NotificationStatus.SENT == result.getStatus()` 로 교체하면 오타·리팩터 리스크를 제거할 수 있다.

**M-BE-03: `@Transactional` 스코프와 send_audit fail-soft 경계 Javadoc 부재**

`saveSendAudit()` 메서드에 `@Transactional` 경계 안에서 실행되지만 catch 가 예외를 삼키는 fail-soft 설계임을 명시하는 주석이 없다. 유지보수 시 의도가 불분명하다.

### LOW

**L-BE-01: `AligoSmsAdapter.MAPPER` static final ObjectMapper — Spring 관리 ObjectMapper 와 독립**

클래스 내부에 `static final ObjectMapper MAPPER = new ObjectMapper()` 를 선언하여 Spring `@Bean ObjectMapper` (커스텀 설정 가능) 와 분리되어 있다. 일반적으로 문제가 없으나 Spring Boot 의 Jackson 설정(날짜 포맷, 모듈 등)이 적용되지 않는다.

**L-BE-02: `resolvePhone()` 에서 하이픈만 제거 — 국제번호 포함 시 처리 미정의**

`addr.replace("-", "")` 만 수행한다. 도메인이 국내 전화번호 전용이면 문제없으나 `+82` 포함 입력이 들어올 경우 Aligo API 오류로 이어진다. 입력 validation 을 `@Pattern` 어노테이션으로 강화하는 것을 권장한다.

**L-BE-03: `DispatchBatchSendServiceTest` — `stubFailedRequest()` 에 `assertThat` 사용 (헬퍼 메서드 내 assertion)**

헬퍼 메서드 `stubFailedRequest()` 내에서 `assertThat(r.getStatus()).isEqualTo(FAILED)` 를 직접 호출하고 있다. 헬퍼는 순수 stub 생성 역할만 해야 하며, assertion 은 호출하는 테스트 메서드에 위치해야 한다.

---

## 2. 검증 항목 PASS/FAIL/WARN

| 항목 | 결과 | 비고 |
|---|---|---|
| BaseEntity 7 audit 상속 | PASS | DispatchSmsSaveHistory → BaseEntity, 기존 entity 재활용 |
| Soft Delete — markDeleted() 전용 | PASS | 물리 삭제 없음, AligoSmsAdapterSendAuditIT.cleanUp() 은 테스트 격리용 직접 DELETE — IT 전용 허용 가능하나 주의 필요 |
| 도메인 메서드 chain (setter 직접 호출 금지) | PASS | `markSent()` / `markFailed()` 사용 확인 |
| send_audit fail-soft | PASS | try-catch 로 예외 흡수, warn 로그 기록 |
| @Transactional 정합 | WARN | saveSendAudit 가 새 트랜잭션(REQUIRES_NEW)으로 저장되는지 saveInNewTransaction 내부 구현 명시 필요 |
| 권한 SP-03 §4.2 — @PreAuthorize | PASS | DISPATCH/MANAGER/MASTER 3개 role |
| 한국어 Javadoc | PASS | adapter / service / controller 모두 한국어 Javadoc 존재 |
| placeholder 4 키워드 case-insensitive | PASS | CHANGE_ME_LOCAL_ONLY / PLACEHOLDER_DEV_ONLY / changeme / dummy 모두 처리 |
| IT @MockBean 격리 (feedback_it_mockbean_external_clients) | PASS | 6개 client MockBean 등록 — UserClient / SlipServiceClient / PartnerLookupClient / BlockedPartnerLookupClient / AligoCsvSourceClient / AligoAddressBookClient |
| lenient stub @BeforeEach | PASS | blockedPartnerLookupClient.isBlocked() lenient stub |
| SEND_AUDIT DB row 생성 IT | PASS | AligoSmsAdapterSendAuditIT 4개 케이스 |
| `result.getStatus().name().equals("SENT")` 문자열 비교 | WARN | enum 직접 비교 권장 |
| X-User-Id required=false → null 허용 | WARN | normalizeUser() 처리 여부 확인 필요 |
| 단위 IT placeholder 조건부 실행 | WARN | 운영 key 환경 가드 무력화 위험 |

---

## 3. 권장 fix

**P1 (HIGH H-BE-03):** `AligoSmsAdapterPlaceholderRuntimeGuardIT` Spring IT 의 TC-1 ~ TC-3 을 if-block 없이 무조건 assertion 으로 교체. 대신 `@BeforeEach` 에서 `aligoProperties.setKey("CHANGE_ME_LOCAL_ONLY")` 를 직접 주입하여 조건을 고정.

**P2 (HIGH H-BE-01):** `DispatchBatchSendService.saveSendAudit()` 메서드 Javadoc 에 REQUIRES_NEW 트랜잭션 격리 + fail-soft 동작을 명시.

**P3 (MEDIUM M-BE-01):** `normalizeUser()` 가 null 을 처리하는지 확인. null 입력 시 "system" 또는 "unknown" 기본값 반환을 명시하거나, Controller 에서 `required = true` 로 변경 (api-gateway 가 항상 전파하는 경우).

**P4 (MEDIUM M-BE-02):** `result.getStatus().name().equals("SENT")` → `NotificationStatus.SENT == result.getStatus()` 로 교체.

**P5 (LOW L-BE-03):** `stubFailedRequest()` 헬퍼에서 assertion 제거, 호출하는 테스트 메서드로 이동.

---

## 4. Claude TM 결정안

**APPROVE with P3/P4 merge-time fix 권고 (cycle 2 불필요)**

- CRITICAL 결함 없음.
- HIGH 결함 2건(H-BE-01, H-BE-02) 은 동작 자체를 깨지 않으며 Javadoc/주석 보강 또는 SP-09-1 연동 변경 사항이므로 다음 슬라이스에서 처리 가능.
- H-BE-03 (IT 조건부 실행) 은 CI placeholder 환경에서 가드가 작동하므로 운영 리스크는 낮다. cycle 2 보다 빠른 fix commit 권고.
- M-BE-01~02 는 merge-time commit 으로 수정 가능한 1~2 라인 변경.
- 전체 구조(BaseEntity / Soft Delete / Javadoc / @MockBean 격리 / fail-soft) 는 프로젝트 컨벤션을 잘 준수하고 있다.

**권고 조치:** H-BE-03 + M-BE-02 는 단일 fix commit 으로 이번 사이클에 처리. H-BE-01 / M-BE-01 / L-BE-01~03 은 backlog 등록.
