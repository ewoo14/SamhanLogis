# SP-D5 BE Cycle 2 Verify — claude-be-cycle2.md

**작성일**: 2026-05-19  
**HEAD**: `a06e3983`  
**검증자**: Claude BE agent

---

## 검증 결과 (6건)

### P0-1: 8 service `@Deprecated DynamicPermissionClient` extends 확인

| 서비스 | `@Deprecated` | `extends ...DynamicPermissionClient` |
|---|---|---|
| accounting | L14 | L16 |
| arologis | L13 | L15 |
| inventory | L11 | L13 |
| notification | L11 | L13 |
| partner-order | L11 | L13 |
| partner | L11 | L13 |
| product | L11 | L13 |
| slip | L11 | L13 |
| user | L11 | L13 |

**결과**: PASS — 9개 서비스 모두 `@Deprecated(since = "SP-D5", forRemoval = true)` + `extends com.samhanair.logis.security.permission.DynamicPermissionClient` 확인.

---

### P1-1: accounting.report 10개 Controller `@PreAuthorize` 제거

대상: BalanceSheet / CashFlow / CorporateTax / DailySummary / EquityChanges / IncomeStatement / MonthlySummary / PartnerAging / TrialBalance(Report) / Vat

`grep -n "@PreAuthorize|import.*PreAuthorize"` — 출력 없음.

**결과**: PASS — 10개 Controller 전부 `@PreAuthorize` 및 관련 import 미존재.

---

### P1-3: `PermissionAspectTest` AspectJProxyFactory + TestProtectedTarget 패턴

`shared/security/.../PermissionAspectTest.java`

- L13: `import org.springframework.aop.aspectj.annotation.AspectJProxyFactory`
- L62–66: `TestProtectedTarget target = new TestProtectedTarget(); AspectJProxyFactory factory = ...; factory.addAspect(aspect); proxy = factory.getProxy();`
- L232–248: `static class TestProtectedTarget` — `@RequirePermission(page=..., action=...)` 메서드 3개 (viewReport / editWarehouse / unsupportedAction)
- 헬퍼 우회 패턴 없음. 9개 테스트 모두 `proxy.*` 호출.

**결과**: PASS — AspectJProxyFactory 실제 AOP 프록시 기반 패턴으로 완전 재작성됨.

---

### P1-4: 3 IT `@BeforeEach setUpPermissionStub()` canView/canEdit lenient stub

| 파일 | `@BeforeEach` | `setUpPermissionStub()` | canView lenient | canEdit lenient |
|---|---|---|---|---|
| TrialBalanceControllerIT | L56 | L57 | L58 | L59 |
| SliceBValidationIT | L78 | L79 | L80 | L81 |
| SliceCValidationIT | L78 | L79 | L80 | L81 |

**결과**: PASS — 3개 IT 모두 `lenient().when(dynamicPermissionClient.canView(...)).thenReturn(true)` + `canEdit` lenient stub 정상 추가됨.

---

### P2-1: `RequirePermission.action()` Javadoc 정정 ("WARN + 건너뜀")

`shared/security/.../RequirePermission.java` L61–62:

```
미지원 값 입력 시 {@link PermissionAspect} 가 WARN 로그를 남기고 권한 검증을 건너뛴다
(운영 안전 우선 — SP-D5 cycle 2 fix P2-1 에서 Javadoc 정정).
```

**결과**: PASS — Javadoc 에 "WARN 로그 + 건너뜀" 명시 확인.

---

### P2-2: `PermissionAspect` line 91 `annotation.action() == null` 죽은 체크 제거

`PermissionAspect.java` 전체에서 `annotation.action() == null` 패턴 없음. L103에서 `annotation.action().isBlank()` 만 사용 (NPE 불가 — annotation element 는 항상 non-null).

**결과**: PASS — 죽은 체크 완전 제거 확인.

---

## 머지 가능 여부

**APPROVE**

사이클 2 fix 6건 전항목 PASS. 새 결함 없음. 사이클 N=3 의무 기준 충족.
