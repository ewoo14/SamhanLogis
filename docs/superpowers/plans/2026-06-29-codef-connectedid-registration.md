# CODEF connectedId 등록 기반 Implementation Plan

> **For agentic workers:** 본 계획은 프로젝트 **표준 워크플로우**(조기 PR → Codex 개발[Claude commit 대행] → Opus·Codex 순차 듀얼리뷰 + 라이브 QA → 0수렴 → 머지)로 구현한다. 각 Task = task별 TDD(실패테스트→구현→통과→commit) 단위. ([[feedback_canonical_workflow]])

**Goal:** CODEF 샌드박스에 대해 회사 단위 connectedId를 등록(OAuth+RSA)하고 등록된 계좌/카드 목록을 실 API로 조회해 connectedId 동작을 증명한다.

**Architecture:** `accounting-service`에 easyCodef SDK 래퍼(`EasyCodefClient` 인터페이스)를 두고, `CodefConnectionService`가 등록/조회를 오케스트레이션한다. connectedId + 기관 메타는 신규 2테이블에 저장하되 실 자격은 절대 저장하지 않는다(SDK가 RSA 암호화 후 CODEF 전송).

**Tech Stack:** Spring Boot 3 / Java 17, `io.codef.api:easycodef-java:1.0.6`, PostgreSQL + Flyway, RestClient(기존), React/Electron(desktop FE).

## Global Constraints
- BaseEntity 7 audit(created/modified/deleted ×at/by + is_deleted) + soft-delete(@SQLRestriction) 의무. ([[project_build_conventions]])
- 🔒 실 금융 자격(ID/PW/인증서) **무저장·무로깅** — 입력→TLS→BE→SDK RSA→CODEF→즉시 폐기. credential-plaintext-guard(SP-08-8) 통과.
- CODEF 키 = gitignored `services/accounting-service/.env`(완료) + prod Secrets Manager. placeholder 차단 가드 유지.
- page-code `accounting.bank-matching`(MASTER) 재사용. UUID/connectedId 비노출(화면=기관명/마스킹 식별자).
- 적용된 Flyway 불변 — 신규 V만. enum 영속값 추가 시 CHECK 제약 동반.
- 한국어 커밋/PR/Javadoc. 변경 모듈 전체 test 완주 후 push(로컬 Testcontainers npipe skip → IT는 CI 검증, push전 코드정독). ([[feedback_minimal_change_client_path]])

## CODEF 샌드박스 참조 (확정)
- SDK: `io.codef.api:easycodef-java:1.0.6`(토큰 발급·재사용·RSA·요청서명 자동). v2(`easycodef-java-v2`)도 존재 — Task 1에서 README 확인 후 택1.
- 도메인: 샌드박스/데모 `https://development.codef.io`. 계정생성 `POST /v1/account/create`(connectedId는 최초 생성 시만 발급, 이후 add/modify/delete).
- account/create 파라미터: `countryCode="KR"`, `businessType`(은행 `BK` / 카드 `CD`), `clientType="P"`, `organization`(기관코드), `loginType`, `password`(publicKey RSA 암호화 — SDK 처리), `id` 등 로그인 자격.
- 상품(목록): 은행 보유계좌 / 카드 보유 등 — Task 6에서 정확 product path 확정([developer.codef.io](https://developer.codef.io/products/bank/common/b/account)).

---

### Task 1: CodefProperties 확장 + easyCodef SDK 의존성 + EasyCodefClient 인터페이스

**Files:**
- Modify: `services/accounting-service/build.gradle` (SDK 의존성)
- Modify: `services/accounting-service/.../config/CodefProperties.java` (+publicKey, +sandboxBaseUrl)
- Create: `services/accounting-service/.../client/codef/EasyCodefClient.java` (인터페이스)
- Create: `services/accounting-service/.../client/codef/dto/` — `CodefRegisterCommand`, `CodefRegisteredAccount`, `CodefRegisterResult`
- Test: `.../config/CodefPropertiesTest.java`

**Interfaces (Produces):**
- `interface EasyCodefClient { CodefRegisterResult registerInstitution(CodefRegisterCommand cmd); List<AccountInfo> listBankAccounts(String connectedId); List<CardInfo> listCards(String connectedId); List<LoanInfo> listLoans(String connectedId); }`
- `record CodefRegisterCommand(String connectedId/*nullable=create*/, String businessType, String organization, String loginType, Map<String,String> credentials)`
- `record CodefRegisterResult(String connectedId, String status/*ACTIVE|ADDITIONAL_AUTH|ERROR*/, String message)`

- [ ] SDK README 확인 후 `build.gradle` 에 `implementation 'io.codef.api:easycodef-java:1.0.6'`(또는 v2) 추가, `./gradlew :services:accounting-service:dependencies` 로 해석 확인.
- [ ] `CodefProperties` 에 `publicKey`(`${codef.public-key:}`)·`sandboxBaseUrl`(`${codef.base-url:https://development.codef.io}`) 추가. 기존 client-id/secret/submit-method 유지.
- [ ] `EasyCodefClient` 인터페이스 + DTO 정의(위 시그니처). 구현체는 Task 6.
- [ ] `CodefPropertiesTest` — 기본값/바인딩 단언. 실행·통과.
- [ ] commit: `feat(accounting): EasyCodef SDK 의존성 + CodefProperties 확장 + EasyCodefClient 인터페이스`

---

### Task 2: 데이터 모델 (Flyway V## + 엔티티 + 리포지토리)

**Files:**
- Create: `services/accounting-service/.../resources/db/migration/V{next}__codef_connection.sql`
- Create: `.../domain/codef/CodefConnection.java`, `.../domain/codef/CodefRegisteredInstitution.java`, enum `CodefBusinessType`(BANK/CARD/LOAN), `CodefInstitutionStatus`(ACTIVE/ERROR/ADDITIONAL_AUTH)
- Create: `.../repository/CodefConnectionRepository.java`, `.../repository/CodefRegisteredInstitutionRepository.java`
- Test: `.../it/CodefConnectionRepositoryIT.java`(AbstractPostgresIT)

**Interfaces (Produces):** `CodefConnection`(id, connectedId, status), `CodefRegisteredInstitution`(id, connection FK, businessType, organizationCode, accountIdentifier, nickname, status, registeredAt, lastVerifiedAt). repo: `findFirstByIsDeletedFalse()`(회사 1행), `findByConnection...`.

- [ ] Flyway: 2테이블 생성(BaseEntity 7 컬럼 포함, FK, status CHECK 제약, `account_identifier` 마스킹 전제). **자격 컬럼 없음**.
- [ ] 엔티티 2 + enum 2 + 리포지토리 2. `@SQLRestriction("is_deleted = false")`.
- [ ] IT: 저장·조회·soft-delete + status CHECK(잘못된 값 거부) 단언. fresh Postgres probe로 V## 적용 검증. 실행·통과.
- [ ] commit: `feat(accounting): codef_connection·codef_registered_institution 모델 + Flyway`

---

### Task 3: CodefConnectionService (등록 + 목록 오케스트레이션)

**Files:**
- Create: `.../service/CodefConnectionService.java`
- Test: `.../it/CodefConnectionServiceIT.java` (`@MockBean EasyCodefClient`)

**Interfaces (Consumes):** `EasyCodefClient`(Task1), repos(Task2). **(Produces):** `registerInstitution(CodefRegisterCommand)→RegisteredInstitutionView`, `listRegistered()→List<...>`, `listAccounts()/listCards()/listLoans()→List<...>`.

- [ ] 실패테스트: 신규 등록 시 `EasyCodefClient.registerInstitution` 호출(connectedId null→create) → 반환 connectedId로 `codef_connection`(없으면 생성) + `codef_registered_institution` 저장, **command.credentials 가 저장/로그에 없음** 단언(mock 인자 캡처).
- [ ] 구현: 등록(기존 connection 조회→connectedId 유무로 create/add 분기→저장→자격 폐기[지역변수 범위 종료]), 목록(connectedId 로 list*). ADDITIONAL_AUTH 결과 시 institution.status 저장 + 그대로 반환.
- [ ] 실패테스트: connectedId 있는 상태 추가등록 → add 경로(connectedId 재사용). 목록 조회 → EasyCodefClient list* passthrough. 통과.
- [ ] commit: `feat(accounting): CodefConnectionService 등록·목록 (자격 무저장)`

---

### Task 4: CodefConnectionController + IT (MASTER 게이트)

**Files:**
- Create: `.../web/CodefConnectionController.java` + dto(`RegisterInstitutionRequest`, `RegisteredInstitutionResponse`, `CodefAccountResponse`...)
- Test: `.../it/CodefConnectionControllerIT.java`(AbstractPostgresIT + `@MockBean EasyCodefClient` + `@MockBean(classes=DynamicPermissionClient)`)

**Endpoints:** `POST /accounting/codef/connection/institutions`(등록), `GET /connection/institutions`(등록목록), `GET /connection/accounts|cards|loans`(검증조회). `@RequirePermission(page="accounting.bank-matching", action=CREATE/VIEW)`.

- [ ] 실패테스트: POST 등록 201 + 응답에 자격 미포함 + EasyCodefClient 호출. GET accounts 200 + list passthrough. 권한 없는 role 403.
- [ ] 구현: 컨트롤러 + DTO(요청=businessType/organization/loginType/credentials, 응답=기관 메타·자격 제외). credentials 는 로그 마스킹.
- [ ] IT 통과(mocked EasyCodefClient). gateway 라우트(`/accounting/**`) 확인.
- [ ] commit: `feat(accounting): CodefConnectionController (MASTER, 자격 무노출)`

---

### Task 5: CodefClientImpl CODEF 분기 → EasyCodefClient (3 list 실연동 배선)

**Files:**
- Modify: `.../client/CodefClientImpl.java` (listBankAccounts/listCards/listLoans 의 CODEF 분기 stub → `EasyCodefClient` 호출. connectedId 는 `CodefConnectionService`/connection 조회로 주입)
- Test: `.../CodefClientImplTest.java` (CODEF 분기 mock + DRY_RUN 분기 회귀 유지)

**Interfaces (Consumes):** `EasyCodefClient`, connection 조회.

- [ ] 실패테스트: submit-method=CODEF + connectedId 존재 시 list* 가 EasyCodefClient 호출. DRY_RUN 은 기존 mock 유지(회귀 0).
- [ ] 구현: CODEF 분기에서 connection.connectedId 로 EasyCodefClient.list* 호출(stub throw 제거). connectedId 없으면 명확 에러(미등록 안내).
- [ ] 통과(DRY_RUN + CODEF 양 분기).
- [ ] commit: `feat(accounting): CodefClientImpl CODEF 분기 EasyCodefClient 배선 (목록)`

---

### Task 6: EasyCodefClient 실 SDK 구현 + 라이브 QA(샌드박스)

**Files:**
- Create: `.../client/codef/EasyCodefClientImpl.java` (`@Profile`/조건부 — DRY_RUN 시 미사용)
- Create: `.../client/codef/EasyCodefFactory.java` (EasyCodef 인스턴스 + publicKey/clientId/secret 설정, sandbox)
- Test: 단위는 어려움(SDK 외부호출) → **로컬 라이브 QA**(`docs/qa/codef-connection/`)

- [ ] SDK README 로 정확 API 확인: `EasyCodef` 생성·`setPublicKey`·`setClientInfoForDemo(clientId, secret)`/sandbox·`createAccount(parameterMap)`/`addAccount`·`requestProduct(productUrl, serviceType, paramMap)`.
- [ ] `EasyCodefFactory`: properties(publicKey/clientId/secret/sandboxBaseUrl)로 EasyCodef 구성.
- [ ] `EasyCodefClientImpl.registerInstitution`: paramMap(countryCode=KR, businessType, clientType=P, organization, loginType, id, password[SDK RSA]) → createAccount/addAccount → connectedId·status 파싱(추가인증 코드 분기 → ADDITIONAL_AUTH).
- [ ] `EasyCodefClientImpl.listBankAccounts/Cards/Loans(connectedId)`: requestProduct(보유계좌/카드 product url, connectedId) → AccountInfo/CardInfo/LoanInfo 매핑. CODEF 응답 URL-decode는 SDK 처리.
- [ ] **라이브 QA**: `.env` 에 CODEF_SUBMIT_METHOD=CODEF + 샌드박스 키 + public-key 설정 → 로컬 기동 → 회계 설정 "CODEF 금융연동"에서 샌드박스 테스트 자격 등록 → connectedId 발급 + 계좌/카드 목록 조회 **실 캡처**(docs/qa/). 자격 무저장 DB 확인.
- [ ] commit: `feat(accounting): EasyCodefClientImpl 실 SDK(샌드박스) + 라이브 QA`

---

### Task 7: FE desktop — 회계 설정 "CODEF 금융연동" 페이지

**Files:**
- Create: `clients/desktop/.../routes/admin/CodefConnectionPage.tsx` + `api/codefConnectionApi.ts`
- Modify: `clients/desktop/.../components/AppLayout.tsx`(회계 설정 메뉴 NavLink), `api/mock.ts`(mock 핸들러)
- Test: `clients/desktop/playwright/codef-connection/codef-connection.spec.ts`

- [ ] 실패테스트(Playwright mock): MASTER 진입 → 기관 등록 폼(은행/카드 선택·로그인 자격 입력) → 등록 → 등록기관 목록 표시 → "계좌 조회" → 목록 표시. 비-MASTER 미노출.
- [ ] 구현: 페이지(등록 폼 + 등록기관 테이블 + 계좌/카드 검증 조회) + api client + mock 핸들러(parseMockBody 3원칙). 자격 입력은 전송 후 폼 클리어(미보관). design-system.
- [ ] typecheck(`npm run typecheck`) + Playwright mock 통과.
- [ ] commit: `feat(desktop): CODEF 금융연동 설정 페이지`

---

## Self-Review

**Spec coverage:** §3 컴포넌트→Task1/3/4/5/6/7, §4 데이터모델→Task2, §5 플로우→Task3/6/7, §6 보안→Global Constraints+Task3/4, §7 에러(2FA 감지)→Task3/6, §8 테스트→각 Task. **전 spec 섹션 task 매핑됨.**
**Placeholder scan:** SDK 정확 메서드명(Task1/6)은 SDK README 종속 외부 의존 — "README 확인 후" 명시(lazy 아님). product url(Task6)은 CODEF 문서 종속. 그 외 구체.
**Type consistency:** `EasyCodefClient`(registerInstitution/listBankAccounts/listCards/listLoans), `CodefRegisterCommand/Result`, `CodefConnection/CodefRegisteredInstitution`, page-code `accounting.bank-matching` 전 task 일관.

## Execution Handoff (표준 워크플로우 적용)
본 프로젝트는 superpowers subagent/inline 실행 대신 **표준 워크플로우**로 구현: Task 묶음(BE Task1~6 / FE Task7, 또는 슬라이스 분할)을 **조기 PR → Codex 개발(Claude commit 대행) → Opus 5-agent + Codex 5-agent 순차 듀얼리뷰 + 라이브 QA → 0수렴 → PM 종합 → 머지**로 진행.
