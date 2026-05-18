# 🔵 Claude TM 통합 리뷰 — SP-D5 Cycle 1

**HEAD**: `ee793327`
**PR**: #247
**리뷰어**: Claude 5-agent 병렬 (BE / FE / Designer / QA / DevOps)
**CI**: ✅ 27/27 PASS (단, AOP no-op 결함으로 인해 CI 통과해도 실 운영 권한 검증 미작동)

## 종합 판정: **FIX 요청** — cycle 2 통합 fix 필요 (P0 2 + P1 4 + P2 2 + Minor 3 = 11건)

---

## P0 / CRITICAL — 2건 (양쪽 reviewer 동시 발견, 머지 차단)

### P0-1 [Codex + Claude BE] AOP 전면 무력화 — DynamicPermissionClient 타입 불일치

- **위치**: `services/*/DynamicPermissionClientImpl.java` (8 service) + `shared/security/.../PermissionAspect.java:59,95`
- **문제**: PermissionAspect 가 `ObjectProvider<com.samhanair.logis.security.permission.DynamicPermissionClient>` 를 주입받지만, 8 service Impl 들이 여전히 local `@Deprecated` interface (`com.samhanair.logis.<service>.client.DynamicPermissionClient`) 를 implements. 결과: shared interface bean 0개 → `clientProvider.getIfAvailable()` = null → 권한 검증 **무음 건너뜀** (`@RequirePermission` 전체 no-op)
- **결과**: 10 endpoint 마이그레이션이 운영 환경에서 권한 검증 0회 수행. CI는 통과하지만 실 운영에서 완전히 깨짐
- **fix**: 8 service `DynamicPermissionClientImpl.java` 의 `implements` 를 shared interface 로 변경 OR 8 local interface 가 shared interface 를 `extends` 하도록

### P0-2 [QA] service tag 불일치 — Grafana metrics 잘못 라벨링

- **위치**: `shared/security/.../PermissionAspect.java:resolveServiceName()`
- **문제**: Controller 패키지 (`com.samhanair.logis.accounting.*`) 에서 `"accounting"` 추론하지만, 실제 `spring.application.name="accounting-service"`. 8 service 모두 동일 불일치 (slip-service, user-service 등)
- **결과**: Prometheus/Grafana Counter `permission_guard_denied_total{service=...}` 가 실제 service 명과 다름 → 대시보드 라벨링 오류
- **fix**: `@Value("${spring.application.name}")` 파라미터 생성자 주입 또는 `Environment` bean 주입으로 service name 동적 조회

---

## P1 / HIGH — 4건 (cycle 2 fix 필수)

### P1-1 [Codex] 10 endpoint `@PreAuthorize` 잔류

- **위치**: `services/accounting-service/.../report/*Controller.java` 10개 (BalanceSheet/CashFlow/CorporateTax/DailySummary/EquityChanges/IncomeStatement/MonthlySummary/PartnerAging/TrialBalance/Vat)
- **문제**: 10 endpoint 모두 `@PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")` 가 그대로 남아 있고 `@RequirePermission` 만 추가됨. scope 의 "@PreAuthorize → @RequirePermission 전환" 미충족
- **fix 순서**: P0-1 fix 먼저 → @PreAuthorize 제거 시 권한 열림 방지. import + annotation 모두 제거

### P1-2 [Codex] AutoConfiguration 조건부 scope 가 `@Component` 로 무력화

- **위치**: `PermissionAspect.java:50` + `PermissionGuardMetrics.java:27` + `PermissionSecurityAutoConfiguration.java:44-64`
- **문제**: AutoConfiguration 이 `@ConditionalOnBean(MeterRegistry)` 조건부 등록하지만, 대상 클래스에 `@Component` 가 붙어 있어 consumer service component scan 시 conditional 우회
- **fix**: PermissionAspect / PermissionGuardMetrics 의 `@Component` 제거. AutoConfiguration `@Bean` 등록만 유지

### P1-3 [Claude BE + QA] PermissionAspectTest 헬퍼 우회 — false green

- **위치**: `shared/security/src/test/java/.../PermissionAspectTest.java`
- **문제**: `PermissionAspectTestHelper` 가 AOP advice 메서드를 직접 호출하지 않고 분기 로직 재구현. `extractRoleCode`, `resolveServiceName`, `client == null` 건너뜀 등 실제 `checkPermission` 경로 미테스트. PermissionAspect 버그 발생해도 통과
- **fix**: `@WebMvcTest + @Import(PermissionAspect.class)` 슬라이스 테스트 또는 Spring AOP proxy + `@MockBean DynamicPermissionClient` 로 재작성

### P1-4 [Claude BE + QA] 다수 IT lenient stub 누락 → 회귀

- **위치**: `services/accounting-service/.../TrialBalanceControllerIT.java`, `SliceBValidationIT`, `SliceCValidationIT` 외 9 report controller IT
- **문제**: `@MockBean DynamicPermissionClient` 선언만 있고 `@BeforeEach` 에 `lenient().when(canView).thenReturn(true)` 없음. P0-1 fix 후 unstubbed Mockito 기본 false → 403 회귀
- **fix**: `AccountingDynamicPermissionIT` 패턴대로 `@BeforeEach` lenient stub 추가 (10 report controller IT 전체)

---

## P2 / MINOR — 2건

### P2-1 [Claude BE] `RequirePermission.action()` Javadoc 오류

- **위치**: `shared/security/.../RequirePermission.java:action()`
- **문제**: Javadoc 에 "미지원 값 입력 시 EDIT 으로 fallback" 명시했으나, 실제 `PermissionAspect:130` 은 `log.warn` + 건너뜀 처리
- **fix**: Javadoc 을 실 동작에 맞게 정정 ("미지원 시 권한 검증 건너뜀 + WARN")

### P2-2 [Claude BE] PermissionAspect:91 죽은 null 체크

- **위치**: `shared/security/.../PermissionAspect.java:91`
- **문제**: `annotation.action() == null` 은 Java annotation element 특성상 도달 불가
- **fix**: 죽은 코드 제거 또는 isBlank() 체크로 대체

---

## Minor — 3건 (Designer 1 + DevOps 2)

### M-1 [Designer] print-impact-zero.md 토큰 표 수 불일치

- **위치**: `docs/design/sp-d5-permission-guard-unification-and-aop/print-impact-zero.md`
- **문제**: 표에 14개 토큰 열거, 실제 `tokens.css` 에는 `--print-*` 23개 존재 (budget/approval-label-h 등 미열거)
- **fix**: 표 갱신 (23개 전수 열거)

### M-2 [DevOps] Grafana datasource yml `uid` 누락

- **위치**: `infrastructure/grafana/provisioning/datasources/prometheus.yml`
- **문제**: 대시보드 JSON 이 `"uid": "PROMETHEUS_DS"` 하드코딩이지만 datasource yml 에 `uid` 필드 없음. Grafana 재기동 시 자동 생성 UUID 와 불일치 → 패널 "datasource not found"
- **fix**: yml 에 `uid: PROMETHEUS_DS` 추가

### M-3 [DevOps] prometheus.yml 주석 stale

- **위치**: `infrastructure/prometheus/prometheus.yml:103`
- **문제**: 주석 "15 scrape target" (실제 17)
- **fix**: 주석 17 정정

---

## 5-team 종합

| Team | 판정 | 결함 |
|---|---|---|
| BE | FIX | P0-1 + P1-3/4 + P2-1/2 (5건) |
| FE | APPROVE | 0건 |
| Designer | APPROVE (Minor 1) | M-1 |
| QA | FIX | P0-2 + P1-3/4 (3건, BE 와 중복) |
| DevOps | FIX (Minor 2) | M-2/M-3 |

## 운영 영향

- **운영 critical 2건**: P0-1 (AOP no-op → 권한 검증 전면 미작동) + P0-2 (Grafana 라벨 오류)
- **CI 통과 ≠ 운영 정상**: CI 가 헬퍼 우회 테스트 (P1-3) + IT 가 P0-1 의 무음 건너뜀에 의존 → green 이지만 실 운영에서 회귀

**TM 결정: FIX 요청 → cycle 2 통합 fix → head B 재검**

상세 5-team 리뷰:
- [`docs/qa/sp-d5-permission-guard-unification-and-aop/claude-be-cycle1.md`](docs/qa/sp-d5-permission-guard-unification-and-aop/claude-be-cycle1.md)
- [`docs/qa/sp-d5-permission-guard-unification-and-aop/claude-fe-cycle1.md`](docs/qa/sp-d5-permission-guard-unification-and-aop/claude-fe-cycle1.md)
- [`docs/qa/sp-d5-permission-guard-unification-and-aop/claude-designer-cycle1.md`](docs/qa/sp-d5-permission-guard-unification-and-aop/claude-designer-cycle1.md)
- [`docs/qa/sp-d5-permission-guard-unification-and-aop/claude-qa-cycle1.md`](docs/qa/sp-d5-permission-guard-unification-and-aop/claude-qa-cycle1.md)
- [`docs/qa/sp-d5-permission-guard-unification-and-aop/claude-devops-cycle1.md`](docs/qa/sp-d5-permission-guard-unification-and-aop/claude-devops-cycle1.md)

Claude TM — 2026-05-19
