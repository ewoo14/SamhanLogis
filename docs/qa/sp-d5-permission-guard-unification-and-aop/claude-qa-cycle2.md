# SP-D5 QA Cycle 2 검증 보고서

**head**: `a06e3983`
**검증일**: 2026-05-19
**검증자**: QA Agent (Claude)

---

## Cycle 1 결함 3건 fix 검증

### D1 P0 — service tag `spring.application.name` 주입

**결과**: PASS

- `PermissionSecurityAutoConfiguration.java:75`
  `@Value("${spring.application.name:unknown}") String applicationName` 파라미터 확인
- `permissionAspect()` bean 메서드가 `applicationName` 을 `PermissionAspect` 생성자에 전달 (line 76)
- `PermissionAspect.java:48` Javadoc 에 P0-2 fix 명시 확인
- 패키지 추론 방식 폐기, `spring.application.name` 단일 소스로 정합

### D2 P1 — PermissionAspectTest AspectJProxyFactory + TestProtectedTarget 패턴

**결과**: PASS

- `PermissionAspectTest.java:13` `import org.springframework.aop.aspectj.annotation.AspectJProxyFactory` 확인
- `PermissionAspectTest.java:55` 필드 `TestProtectedTarget proxy`
- `PermissionAspectTest.java:63-66` `@BeforeEach` 내 `TestProtectedTarget target = new TestProtectedTarget()` → `AspectJProxyFactory` → `factory.addAspect(aspect)` → `proxy = factory.getProxy()` 순서 확인
- `PermissionAspectTest.java:232` 내부 정적 클래스 `TestProtectedTarget` 정의 확인
- 기존 헬퍼 우회 폐기, 실제 `@Around` advice 경로 검증으로 전환 완료

### D3 P1 — TrialBalanceControllerIT / SliceBValidationIT / SliceCValidationIT lenient stub

**결과**: PASS

| 파일 | @BeforeEach | setUpPermissionStub | lenient stub |
|---|---|---|---|
| `TrialBalanceControllerIT.java:56-60` | O | O | canView/canEdit lenient true |
| `SliceBValidationIT.java:78-81` | O | O | canView/canEdit lenient true |
| `SliceCValidationIT.java:78-81` | O | O | canView/canEdit lenient true |

3개 IT 모두 `@MockBean DynamicPermissionClient` 선언 + `@BeforeEach setUpPermissionStub()` 패턴 일치.

---

## 머지 판정

**PASS — 머지 가능**

Cycle 1 결함 3건 (P0 1건, P1 2건) 전부 수정 확인. 새 결함 없음. 사이클 N=2 완료 기준 충족.
