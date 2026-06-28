# A2-G1 (BE) 그룹웨어 결재 일원화 — 구현 계획

> **표준 워크플로우 구현**: Opus 기획(본 계획)+조기 PR → Codex 개발(Claude commit 대행) → 순차 듀얼리뷰(Opus 5-agent+직접fix+라이브QA스샷+TM ↔ Codex 5-agent+fix+TM) → 0수렴 → PM 종합 → CI green → PM 머지. (superpowers 실행 스킬 대신 Samhan 워크플로우 = Codex 가 구현, 본 계획+spec 이 기획 산출물.)

**Goal:** 그룹웨어 결재 문서 생성 시 중앙 `approval_line_config` 결재선을 `ApprovalStep` 으로 인스턴스화(per-doc override·GROUP 양모드), config 미설정 유형은 기존 수동(opt-in).

**Architecture:** 중앙 config(auth) = 결재선 단일 정의원. groupware-service `ApprovalLineService.create` 가 결재유형 documentType 의 config 결재선을 internal 조회 → CREATOR/USER/GROUP 단계 인스턴스화 + req override 머지. 미설정이면 기존 수동 chain.

**Tech Stack:** Spring Boot 3.3/Java 17, JPA/Flyway, shared `approval-core`(ApprovalStepBase·StepType·ApprovalLineBase), loadBalanced RestClient(internal), Testcontainers PG. spec: `docs/superpowers/specs/2026-06-28-groupware-approval-unification-design.md`.

## Global Constraints
- BaseEntity 7-audit + Soft Delete · 도메인 메서드(직접 set 금지) · 한국어 Javadoc.
- **적용된 마이그레이션 불변**(신규 V·fresh PG probe). approval_steps GROUP 컬럼은 **V8 에 이미 적용**(approver_group_id·required_page_code) — 신규 컬럼 마이그 불요. config 시드는 신규 V(멱등 WHERE NOT EXISTS).
- 결재자 PII/UUID 비노출(실명 resolve §7) · page-code FE↔BE 일치 · 사용자 노출 한국어.
- internal 호출 X-Internal-Token · authorize client parse fail-closed + **DI 가드 테스트** 필수([[restclient-contract-test-false-green]]).
- 결재선 정의는 중앙 권위(위조 방지) · config 미설정=fail-safe 기존 수동(슬립 A2 `configured=false 통과` 일관).

## 선반영(재사용) 현황
- `ApprovalStepBase`(shared): stepType·approverUserId·**approverGroupId·requiredPageCode(선반영)**·sequence·status·approve/reject. `initUserStep`만 실배선, `matchesActor`=USER만.
- `StepType`{CREATOR,GROUP,USER}. groupware `ApprovalStep.createUser` / `ApprovalLine.appendStep`(USER).
- groupware `ApprovalLineService.create(req)`: req 결재자→`appendStep`(USER), 중복 가드.
- 중앙 `auth ApprovalLineConfig`(documentType generic·sequence·label·StepType·actionKey) + `ApprovalLineApprover` + `ApprovalLineAuthorizeController` + 슬립 `ApprovalLineAuthorizeClient`(accounting 등) 패턴.

## File Structure
- **Modify** `shared/approval-core/.../ApprovalStepBase.java`: GROUP 단계 init(`initGroupStep(groupId, requiredPageCode, sequence)`) + `matchesActor` GROUP 분기(액터가 그룹 멤버 또는 requiredPageCode 보유). (컬럼 존재.)
- **Modify** `services/groupware-service/.../domain/ApprovalStep.java`: `createGroup(line, groupId, requiredPageCode, sequence)` 팩토리. `ApprovalLine.java`: `appendGroupStep`/인스턴스화 진입.
- **Create** `services/groupware-service/.../client/GroupwareApprovalLineConfigClient.java`: auth internal `결재선 조회`(documentType)→roles[]. RestClient 패턴(loadBalanced·fail-closed·운영 생성자 @Autowired).
- **Modify** `services/groupware-service/.../service/ApprovalLineService.create`: config 조회 → 있으면 인스턴스화(CREATOR/USER/GROUP)+req override 머지, 없으면 기존 수동.
- **Create** `services/auth-service/.../resources/db/migration/V##__seed_groupware_approval_line_config.sql`: 그룹웨어 결재유형 결재선 시드(멱등). (auth authorize/조회 generic 검증.)
- **Create/Modify** auth `결재선 조회` internal 엔드포인트(documentType→roles+approvers) — 슬립 authorize 패턴 일반화(없으면 신규).
- **Create** IT `services/groupware-service/.../it/ApprovalLineConfigInstantiationIT.java`(실 PG).
- **Create** `services/groupware-service/.../client/GroupwareApprovalLineConfigClientDiGuardTest.java`.

## Tasks

### Task 1: ApprovalStepBase GROUP 단계 + matchesActor 분기
**Files:** Modify `shared/approval-core/.../ApprovalStepBase.java` · Test `shared/approval-core/.../ApprovalStepBaseGroupTest.java`(or groupware 단위).
**Interfaces:** Produces `protected void initGroupStep(UUID approverGroupId, String requiredPageCode, int sequence)` · `matchesActor(UUID, Set<UUID> actorGroupIds, Set<String> actorPageCodes)` 확장(또는 GROUP 판정 헬퍼).
- [ ] 실패 테스트: GROUP 단계 init 시 stepType=GROUP·approverGroupId 설정·PENDING. matchesActor: 액터 그룹에 approverGroupId 포함 시 true, USER 단계는 기존대로.
- [ ] 구현: `initGroupStep`(approverGroupId 필수·requiredPageCode optional·status PENDING). `matchesActor` GROUP 분기(그룹 멤버십 또는 requiredPageCode). 기존 USER 시그니처 호환 유지(오버로드 또는 컨텍스트 객체).
- [ ] 테스트 통과 · 커밋.

### Task 2: groupware ApprovalStep.createGroup + ApprovalLine 인스턴스화 진입
**Files:** Modify `services/groupware-service/.../domain/ApprovalStep.java`·`ApprovalLine.java` · Test 동일 패키지.
**Interfaces:** Produces `ApprovalStep.createGroup(ApprovalLine, UUID groupId, String requiredPageCode, int seq)` · `ApprovalLine.appendGroupStep(...)` · `ApprovalLine.instantiateFromRoles(List<ResolvedRole>)`(CREATOR→작성자 USER 단계·USER→approverUserId·GROUP→group 단계).
- [ ] 실패 테스트: ResolvedRole 목록(CREATOR/USER/GROUP 혼합)→ instantiateFromRoles → 순서대로 ApprovalStep(USER/GROUP) 생성, sequence 0-base.
- [ ] 구현: createGroup 팩토리(initGroupStep 위임)·appendGroupStep·instantiateFromRoles(CREATOR=요청자 userId 로 USER 단계). 중복 가드 재사용.
- [ ] 통과 · 커밋.

### Task 3: 중앙 config 그룹웨어 결재선 조회 + 시드
**Files:** auth `결재선 조회` internal 엔드포인트(documentType→roles+approvers DTO) — 기존 authorize 패턴 일반화 · `V##__seed_groupware_approval_line_config.sql`(멱등) · Test auth IT(조회·멱등).
**Interfaces:** Produces `GET/POST /auth/internal/approval-line/roles?documentType=` → `{configured, roles:[{sequence,label,stepType,approverGroupId,approverUserIds,requiredPageCode,required}]}`(X-Internal-Token).
- [ ] 실패 테스트(auth IT 실 PG): 그룹웨어 documentType 시드 후 roles 조회 = 시드 결재선. 미시드 documentType = configured:false.
- [ ] 구현: 조회 엔드포인트(ApprovalLineConfig+Approver join, documentType generic) · V## 시드(예시 결재유형 1종 결재선: 작성자 CREATOR→부서장 GROUP→대표 USER, 멱등 WHERE NOT EXISTS). fresh PG probe.
- [ ] 통과 · 커밋.

### Task 4: GroupwareApprovalLineConfigClient + create 인스턴스화 분기
**Files:** Create `client/GroupwareApprovalLineConfigClient.java`+DiGuardTest · Modify `service/ApprovalLineService.create` · Test client 계약(MockRestServiceServer).
**Interfaces:** Consumes Task3 엔드포인트. Produces `configClient.fetchRoles(documentType)`→Optional<ConfigLine>. `create` 흐름: documentType 결정(결재유형) → configClient 조회 → configured 면 instantiateFromRoles(roles, 작성자, override=req.approvers) → 아니면 기존 수동.
- [ ] 실패 테스트: client 계약(roles 응답 파싱·fail-closed=빈/에러 시 미설정 취급) + DI 가드(운영 생성자 @Autowired 단일).
- [ ] 구현: RestClient(loadBalanced lb://auth-service·X-Internal-Token·parse fail-closed) · create 분기(configured→인스턴스화+override 머지[req 결재자=추가/순서 조정], 미설정→기존). GROUP 단계 충족은 Task1 matchesActor.
- [ ] 통과 · 커밋.

### Task 5: 인스턴스화 통합 IT (실 PG)
**Files:** Create `it/ApprovalLineConfigInstantiationIT.java`(AbstractPostgresIT 상속·@MockBean configClient).
- [ ] 테스트(실 PG·configClient @MockBean):
  - configured 유형 create → ApprovalStep 이 config roles 순서/타입대로(CREATOR=작성자 USER·USER·GROUP) 인스턴스화.
  - per-doc override(req 결재자 추가) → 인스턴스에 반영.
  - GROUP 단계 = 그룹 멤버 액터 approve 통과 / 비멤버 차단.
  - GROUP 1인 지정(override 로 USER 치환) 동작.
  - 미설정 유형 create → 기존 수동 chain(회귀 0).
- [ ] 통과 · 커밋.

## Self-Review
- **Spec coverage**: ①매핑=Task3(documentType 조회/시드)·②인스턴스화+override=Task2/4·③GROUP 양모드=Task1(matchesActor)+Task2(group 단계)+Task4(1인 override)·④additive opt-in=Task4 분기+Task5·⑤A2-G1 범위=BE. ✓
- **Placeholder**: V##(버전 구현 시 할당)·예시 결재유형(시드 구체화 Codex)·DTO 필드명은 Task3 에서 확정. 코드 시그니처는 인터페이스 블록에 명시.
- **Type 일관**: instantiateFromRoles/createGroup/fetchRoles 시그니처 Task 간 일치.

## Execution Handoff (Samhan 워크플로우)
본 계획 = Opus 기획. 다음: **조기 PR 개설**(feat/groupware-approval-unification, spec+계획) → **Codex 개발 디스패치**(Task1~5, Claude commit 대행) → 검증(컴파일·IT·fresh PG probe) → 순차 듀얼리뷰(Opus 5-agent+라이브QA ↔ Codex) 0수렴 → PM 종합 → CI green → 머지 → A2-G2(FE).
