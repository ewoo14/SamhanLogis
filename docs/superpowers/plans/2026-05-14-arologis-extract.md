# 아로로지스 독립 서비스 분리 — 구현 plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **5-team 디스패치 패턴** ([[feedback_multi_agent_team_pattern]]) — BE/FE/Designer/QA/DevOps 가 병렬, TM 통합, PM CI 모니터링 + 개발책임자 머지 요청.

**Goal:** Samhan Public monorepo 의 `arologis-service` (W10-1~W10-4 완료) 를 독립 운영 단위로 분리. 같은 AWS 환경 공유, service-to-service 통신 유지, 자체 auth + 기사 휴대번호 passwordless 로그인 추가.

**Architecture:** monorepo 유지 + build/배포만 분리 + clients/arologis-{desktop,mobile} 신규 추출 + arologis.samhan-air.com 도메인 + 자체 auth/user 도메인 (arologis-service 내장) + shared:user-client-abstraction 의존 제거. AWS 비용 변경 0.

**Tech Stack:** Spring Boot 3 / Java 17 / PostgreSQL (Flyway) / Eureka / Electron + Vite + React (arologis-desktop) / RN Expo (arologis-mobile) / GitHub Actions / Docker / Route53 + Nginx.

**참조 spec:** `docs/superpowers/specs/2026-05-14-arologis-extract-design.md`

---

## 팀 디스패치 구조

| 팀 | scope | 산출 |
|---|---|---|
| **BE** | 자체 auth+user 도메인, UserClient 제거, JwtFilter, Flyway V7~V9, IT 4 신규 + IT 13 갱신 | services/arologis-service/** |
| **FE** | clients/arologis-desktop + clients/arologis-mobile 신규, git mv 이전, import path 갱신, 신규 로그인 화면 | clients/arologis-desktop/**, clients/arologis-mobile/**, clients/desktop/**, clients/mobile-staff/** (삭제) |
| **Designer** | 신규 화면 4종 (admin login / mobile phone login / GPS permission / driver CRUD) + 다운로드 페이지 / store deeplink 페이지 mock | docs/uiux/arologis-extract/** |
| **QA** | 6 시나리오 캡처 + 신규 IT 검증 SQL + 회귀 33 case 절차 + 롤백 dry-run | docs/qa/arologis-extract/** |
| **DevOps** | arologis-ci.yml + arologis-deploy.yml + docker-compose.arologis.yml + Route53 + Nginx + Docker image build/push + EC2 health Lambda 영향 0 확인 | .github/workflows/**, infrastructure/** |

각 팀은 task 를 순차 진행. 5 팀 작업 완료 후 **TM** 이 통합 검토 + 컴파일/회귀 가드 + 문서 동기화 + 통합 PR 발행. **PM** 이 CI watch + green 후 개발책임자 머지 요청.

---

# Team 1: BE

## 파일 구조 (services/arologis-service/)

```
src/main/java/com/samhanair/logis/arologis/
├── domain/
│   ├── auth/
│   │   ├── AdminUser.java               (NEW)
│   │   ├── AdminUserRole.java           (NEW — AROLOGIS_MASTER, AROLOGIS_MANAGER)
│   │   └── RefreshToken.java            (NEW)
│   └── Driver.java                       (수정 — appUserId @Deprecated)
├── repository/
│   ├── AdminUserRepository.java         (NEW)
│   └── RefreshTokenRepository.java      (NEW)
├── service/
│   └── auth/
│       ├── AdminLoginService.java       (NEW)
│       ├── DriverLoginService.java      (NEW — passwordless)
│       ├── RefreshTokenService.java     (NEW — rotation)
│       └── JwtIssuer.java               (NEW)
├── controller/
│   ├── ArologisAuthController.java      (NEW — /auth/admin/login, /auth/driver/login, /auth/refresh, /auth/logout, /auth/me)
│   └── ... (기존 controller 9개 — @PreAuthorize role 갱신)
├── config/
│   ├── SecurityConfig.java              (수정 — JwtFilter 활성)
│   ├── HeaderAuthenticationFilter.java  (수정 — JWT 직접 검증)
│   └── ArologisJwtProperties.java       (NEW — secret/expiry)
└── client/
    └── UserClient.java                   (삭제)

src/main/resources/db/migration/
├── V7__add_arologis_auth_user.sql        (NEW)
├── V8__add_arologis_refresh_token.sql    (NEW)
└── V9__seed_arologis_master.sql          (NEW — dev seed only)

src/test/java/com/samhanair/logis/arologis/
├── it/
│   ├── ArologisAdminAuthIT.java          (NEW)
│   ├── ArologisDriverAuthIT.java         (NEW)
│   ├── ArologisAuthSecurityIT.java       (NEW)
│   └── ArologisRefreshTokenIT.java       (NEW)
└── ... (기존 IT 13 — @MockBean UserClient 제거)

build.gradle                              (수정 — :shared:user-client-abstraction 의존 제거)
```

---

## BE Task B1: AdminUser 도메인 entity + Flyway V7

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/auth/AdminUser.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/auth/AdminUserRole.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/repository/AdminUserRepository.java`
- Create: `services/arologis-service/src/main/resources/db/migration/V7__add_arologis_auth_user.sql`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/repository/AdminUserRepositoryTest.java`

- [ ] **B1.1 — failing test 작성** (AdminUserRepositoryTest)

```java
@SpringBootTest
class AdminUserRepositoryTest extends AbstractPostgresIT {
    @Autowired AdminUserRepository repo;

    @Test
    void save_and_lookup_by_loginId_active() {
        AdminUser u = AdminUser.create("admin", "$2a$10$bcrypt", "관리자", AdminUserRole.AROLOGIS_MASTER);
        repo.save(u);
        assertThat(repo.findByLoginIdAndIsDeletedFalse("admin")).isPresent();
    }

    @Test
    void soft_deleted_excluded() {
        AdminUser u = AdminUser.create("a", "h", "n", AdminUserRole.AROLOGIS_MANAGER);
        u.softDelete("system");
        repo.save(u);
        assertThat(repo.findByLoginIdAndIsDeletedFalse("a")).isEmpty();
    }

    @Test
    void partial_unique_loginId_allows_reactivation_after_soft_delete() {
        AdminUser u1 = AdminUser.create("dup", "h", "n", AdminUserRole.AROLOGIS_MANAGER);
        u1.softDelete("system");
        repo.save(u1);
        AdminUser u2 = AdminUser.create("dup", "h", "n", AdminUserRole.AROLOGIS_MANAGER);
        assertThatCode(() -> repo.save(u2)).doesNotThrowAnyException();
    }
}
```

- [ ] **B1.2 — 실행 확인 (FAIL)**

```bash
./gradlew :services:arologis-service:test --tests "*AdminUserRepositoryTest" -i
```
Expected: FAIL (`AdminUser` not found)

- [ ] **B1.3 — entity 작성**

```java
// AdminUser.java
@Entity
@Table(name = "auth_admin_user")
@SQLRestriction("is_deleted = false")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AdminUser extends BaseEntity {
    @Id @GeneratedValue private UUID id;
    @Column(name = "login_id", nullable = false, length = 64) private String loginId;
    @Column(name = "password_hash", nullable = false, length = 200) private String passwordHash;
    @Column(nullable = false, length = 100) private String name;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private AdminUserRole role;

    public static AdminUser create(String loginId, String passwordHash, String name, AdminUserRole role) {
        AdminUser u = new AdminUser();
        u.loginId = loginId;
        u.passwordHash = passwordHash;
        u.name = name;
        u.role = role;
        return u;
    }
}

// AdminUserRole.java
public enum AdminUserRole { AROLOGIS_MASTER, AROLOGIS_MANAGER }
```

- [ ] **B1.4 — repository 작성**

```java
public interface AdminUserRepository extends JpaRepository<AdminUser, UUID> {
    Optional<AdminUser> findByLoginIdAndIsDeletedFalse(String loginId);
}
```

- [ ] **B1.5 — Flyway V7 작성**

```sql
-- V7__add_arologis_auth_user.sql
CREATE TABLE auth_admin_user (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    login_id        VARCHAR(64)  NOT NULL,
    password_hash   VARCHAR(200) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    role            VARCHAR(32)  NOT NULL CHECK (role IN ('AROLOGIS_MASTER','AROLOGIS_MANAGER')),
    created_at      TIMESTAMPTZ  NOT NULL,
    created_by      VARCHAR(100) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(100) NOT NULL,
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    deleted_by      VARCHAR(100)
);
CREATE UNIQUE INDEX uq_auth_admin_user_login_id_active
    ON auth_admin_user(login_id) WHERE is_deleted = FALSE;
```

- [ ] **B1.6 — test 통과 확인 (PASS)**

```bash
./gradlew :services:arologis-service:test --tests "*AdminUserRepositoryTest" -i
```
Expected: 3 case PASS

- [ ] **B1.7 — commit**

```bash
git add services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/auth/AdminUser.java \
        services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/auth/AdminUserRole.java \
        services/arologis-service/src/main/java/com/samhanair/logis/arologis/repository/AdminUserRepository.java \
        services/arologis-service/src/main/resources/db/migration/V7__add_arologis_auth_user.sql \
        services/arologis-service/src/test/java/com/samhanair/logis/arologis/repository/AdminUserRepositoryTest.java
git commit -m "feat(arologis-extract): AdminUser 도메인 + Flyway V7 + partial unique 가드"
```

---

## BE Task B2: RefreshToken entity + Flyway V8

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/auth/RefreshToken.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/repository/RefreshTokenRepository.java`
- Create: `services/arologis-service/src/main/resources/db/migration/V8__add_arologis_refresh_token.sql`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/repository/RefreshTokenRepositoryTest.java`

- [ ] **B2.1 — failing test 작성**

```java
@SpringBootTest
class RefreshTokenRepositoryTest extends AbstractPostgresIT {
    @Autowired RefreshTokenRepository repo;

    @Test
    void save_and_find_by_token_hash_active() {
        UUID userId = UUID.randomUUID();
        RefreshToken rt = RefreshToken.issue(userId, RefreshTokenUserType.ADMIN, "hash-abc", Instant.now().plusSeconds(2592000));
        repo.save(rt);
        assertThat(repo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("hash-abc")).isPresent();
    }

    @Test
    void revoked_excluded() {
        RefreshToken rt = RefreshToken.issue(UUID.randomUUID(), RefreshTokenUserType.DRIVER, "h2", Instant.now().plusSeconds(60));
        rt.revoke();
        repo.save(rt);
        assertThat(repo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("h2")).isEmpty();
    }
}
```

- [ ] **B2.2 — 실행 확인 (FAIL)**

```bash
./gradlew :services:arologis-service:test --tests "*RefreshTokenRepositoryTest" -i
```

- [ ] **B2.3 — entity + enum 작성**

```java
public enum RefreshTokenUserType { ADMIN, DRIVER }

@Entity
@Table(name = "auth_refresh_token")
@SQLRestriction("is_deleted = false")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken extends BaseEntity {
    @Id @GeneratedValue private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Enumerated(EnumType.STRING) @Column(name = "user_type", nullable = false, length = 16) private RefreshTokenUserType userType;
    @Column(name = "token_hash", nullable = false, length = 200) private String tokenHash;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(nullable = false) private boolean revoked;

    public static RefreshToken issue(UUID userId, RefreshTokenUserType type, String tokenHash, Instant expiresAt) {
        RefreshToken rt = new RefreshToken();
        rt.userId = userId; rt.userType = type; rt.tokenHash = tokenHash; rt.expiresAt = expiresAt;
        rt.revoked = false;
        return rt;
    }

    public void revoke() { this.revoked = true; }
}
```

- [ ] **B2.4 — repository 작성**

```java
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {
    Optional<RefreshToken> findByTokenHashAndRevokedFalseAndIsDeletedFalse(String tokenHash);
}
```

- [ ] **B2.5 — Flyway V8 작성**

```sql
CREATE TABLE auth_refresh_token (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL,
    user_type       VARCHAR(16)  NOT NULL CHECK (user_type IN ('ADMIN','DRIVER')),
    token_hash      VARCHAR(200) NOT NULL,
    expires_at      TIMESTAMPTZ  NOT NULL,
    revoked         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL,
    created_by      VARCHAR(100) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(100) NOT NULL,
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    deleted_by      VARCHAR(100)
);
CREATE INDEX idx_refresh_token_user ON auth_refresh_token(user_id, expires_at);
CREATE UNIQUE INDEX uq_refresh_token_hash_active
    ON auth_refresh_token(token_hash) WHERE is_deleted = FALSE;
```

- [ ] **B2.6 — test 통과 확인 (PASS)**

- [ ] **B2.7 — commit**

```bash
git commit -m "feat(arologis-extract): RefreshToken 도메인 + Flyway V8 + rotation 지원"
```

---

## BE Task B3: Driver entity 갱신 (appUserId @Deprecated)

**Files:**
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/Driver.java`

- [ ] **B3.1 — appUserId 필드에 @Deprecated 추가**

```java
@Deprecated  // 2026-05-14 분리 — 자체 user 도메인 도입으로 사용 안 함, NULL 허용 유지
@Column(name = "app_user_id")
private UUID appUserId;
```

- [ ] **B3.2 — Driver 의 phoneNumber 활성 unique 검증 케이스 추가** (DriverRepositoryTest 또는 기존 확장)

`findByPhoneNumberAndIsDeletedFalse(String phoneNumber)` 존재 확인 — 없으면 추가:

```java
public interface DriverRepository extends JpaRepository<Driver, UUID> {
    Optional<Driver> findByPhoneNumberAndIsDeletedFalse(String phoneNumber);
    // ... 기존 메서드
}
```

- [ ] **B3.3 — 회귀 단위 테스트 실행**

```bash
./gradlew :services:arologis-service:test --tests "*DriverRepository*" -i
```
Expected: 회귀 0 + 신규 lookup PASS

- [ ] **B3.4 — commit**

```bash
git commit -m "refactor(arologis-extract): Driver.appUserId @Deprecated + phoneNumber 활성 unique 조회 메서드 노출"
```

---

## BE Task B4: JwtIssuer + JwtProperties

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/ArologisJwtProperties.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/auth/JwtIssuer.java`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/auth/JwtIssuerTest.java`

- [ ] **B4.1 — JwtProperties 작성**

```java
@ConfigurationProperties(prefix = "samhan.arologis.jwt")
@Getter @Setter
public class ArologisJwtProperties {
    private String secret;
    private long accessExpirySeconds = 3600;       // 1h
    private long refreshExpirySeconds = 2592000;   // 30d
    private String issuer = "arologis-service";
}
```

- [ ] **B4.2 — JwtIssuerTest 작성 (failing)**

```java
class JwtIssuerTest {
    private final ArologisJwtProperties props = new ArologisJwtProperties();
    private JwtIssuer issuer;

    @BeforeEach
    void setUp() {
        props.setSecret("01234567890123456789012345678901234567890123456789ab"); // 64+ char
        issuer = new JwtIssuer(props);
    }

    @Test
    void admin_token_contains_loginId_and_role() {
        UUID id = UUID.randomUUID();
        String token = issuer.issueAccessForAdmin(id, "admin", AdminUserRole.AROLOGIS_MASTER);
        var claims = issuer.parse(token);
        assertThat(claims.getSubject()).isEqualTo(id.toString());
        assertThat(claims.get("role")).isEqualTo("AROLOGIS_MASTER");
        assertThat(claims.get("loginId")).isEqualTo("admin");
    }

    @Test
    void driver_token_contains_phone_and_driverCode() {
        UUID id = UUID.randomUUID();
        String token = issuer.issueAccessForDriver(id, "D001", "01012345678");
        var claims = issuer.parse(token);
        assertThat(claims.get("role")).isEqualTo("AROLOGIS_DRIVER");
        assertThat(claims.get("driverCode")).isEqualTo("D001");
        assertThat(claims.get("phoneNumber")).isEqualTo("01012345678");
    }

    @Test
    void expired_token_throws() {
        props.setAccessExpirySeconds(-1);
        String token = issuer.issueAccessForAdmin(UUID.randomUUID(), "x", AdminUserRole.AROLOGIS_MASTER);
        assertThatThrownBy(() -> issuer.parse(token)).isInstanceOf(ExpiredJwtException.class);
    }
}
```

- [ ] **B4.3 — JwtIssuer 작성 (jjwt 0.12 활용 — 이미 shared:common 의존?)**

```java
@Component
@RequiredArgsConstructor
public class JwtIssuer {
    private final ArologisJwtProperties props;

    public String issueAccessForAdmin(UUID userId, String loginId, AdminUserRole role) {
        return Jwts.builder()
            .subject(userId.toString())
            .issuer(props.getIssuer())
            .claim("role", role.name())
            .claim("loginId", loginId)
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plusSeconds(props.getAccessExpirySeconds())))
            .signWith(Keys.hmacShaKeyFor(props.getSecret().getBytes(StandardCharsets.UTF_8)))
            .compact();
    }

    public String issueAccessForDriver(UUID driverId, String driverCode, String phoneNumber) {
        return Jwts.builder()
            .subject(driverId.toString())
            .issuer(props.getIssuer())
            .claim("role", "AROLOGIS_DRIVER")
            .claim("driverCode", driverCode)
            .claim("phoneNumber", phoneNumber)
            .issuedAt(Date.from(Instant.now()))
            .expiration(Date.from(Instant.now().plusSeconds(props.getAccessExpirySeconds())))
            .signWith(Keys.hmacShaKeyFor(props.getSecret().getBytes(StandardCharsets.UTF_8)))
            .compact();
    }

    public String issueRefreshToken() {
        return UUID.randomUUID().toString() + "." + UUID.randomUUID().toString();
    }

    public String hash(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(md.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public Claims parse(String token) {
        return Jwts.parser()
            .verifyWith(Keys.hmacShaKeyFor(props.getSecret().getBytes(StandardCharsets.UTF_8)))
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
```

- [ ] **B4.4 — application.yml 갱신**

```yaml
samhan:
  arologis:
    jwt:
      secret: ${SAMHAN_AROLOGIS_JWT_SECRET:dev-only-secret-must-be-64-chars-or-longer-for-hmac-sha256-min-x}
      access-expiry-seconds: 3600
      refresh-expiry-seconds: 2592000
      issuer: arologis-service
```

- [ ] **B4.5 — @EnableConfigurationProperties(ArologisJwtProperties.class)** 를 `ArologisServiceApplication.java` 또는 별도 `@Configuration` 에 추가

- [ ] **B4.6 — test 통과 확인 (PASS)**

- [ ] **B4.7 — commit**

```bash
git commit -m "feat(arologis-extract): JwtIssuer + JwtProperties (HS256, refresh rotation 지원)"
```

---

## BE Task B5: AdminLoginService

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/auth/AdminLoginService.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/AdminLoginRequest.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/AuthTokenResponse.java`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/auth/AdminLoginServiceTest.java`

- [ ] **B5.1 — test 작성 (failing)**

```java
@ExtendWith(MockitoExtension.class)
class AdminLoginServiceTest {
    @Mock AdminUserRepository userRepo;
    @Mock RefreshTokenRepository refreshRepo;
    @Mock JwtIssuer issuer;
    @Mock PasswordEncoder encoder;
    @InjectMocks AdminLoginService svc;

    @Test
    void success_emits_access_and_refresh() {
        UUID id = UUID.randomUUID();
        AdminUser u = AdminUser.create("admin", "hash", "n", AdminUserRole.AROLOGIS_MASTER);
        ReflectionTestUtils.setField(u, "id", id);
        when(userRepo.findByLoginIdAndIsDeletedFalse("admin")).thenReturn(Optional.of(u));
        when(encoder.matches("pw", "hash")).thenReturn(true);
        when(issuer.issueAccessForAdmin(eq(id), eq("admin"), eq(AdminUserRole.AROLOGIS_MASTER))).thenReturn("ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("REFRESH");
        when(issuer.hash("REFRESH")).thenReturn("RHASH");

        AuthTokenResponse res = svc.login(new AdminLoginRequest("admin", "pw"));
        assertThat(res.accessToken()).isEqualTo("ACCESS");
        assertThat(res.refreshToken()).isEqualTo("REFRESH");
        assertThat(res.role()).isEqualTo("AROLOGIS_MASTER");
        verify(refreshRepo).save(any(RefreshToken.class));
    }

    @Test
    void unknown_loginId_throws_401() {
        when(userRepo.findByLoginIdAndIsDeletedFalse(any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> svc.login(new AdminLoginRequest("x", "x")))
            .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void wrong_password_throws_401() {
        AdminUser u = AdminUser.create("a","hash","n",AdminUserRole.AROLOGIS_MANAGER);
        when(userRepo.findByLoginIdAndIsDeletedFalse("a")).thenReturn(Optional.of(u));
        when(encoder.matches(any(), any())).thenReturn(false);
        assertThatThrownBy(() -> svc.login(new AdminLoginRequest("a","wrong")))
            .isInstanceOf(BadCredentialsException.class);
    }
}
```

- [ ] **B5.2 — DTO 작성**

```java
public record AdminLoginRequest(@NotBlank String loginId, @NotBlank String password) {}

public record AuthTokenResponse(
    String accessToken,
    String refreshToken,
    String role,
    Instant expiresAt
) {}
```

- [ ] **B5.3 — Service 작성**

```java
@Service
@RequiredArgsConstructor
@Transactional
public class AdminLoginService {
    private final AdminUserRepository userRepo;
    private final RefreshTokenRepository refreshRepo;
    private final JwtIssuer issuer;
    private final PasswordEncoder encoder;
    private final ArologisJwtProperties props;

    public AuthTokenResponse login(AdminLoginRequest req) {
        AdminUser user = userRepo.findByLoginIdAndIsDeletedFalse(req.loginId())
            .orElseThrow(() -> new BadCredentialsException("invalid credentials"));
        if (!encoder.matches(req.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("invalid credentials");
        }
        String access = issuer.issueAccessForAdmin(user.getId(), user.getLoginId(), user.getRole());
        String refresh = issuer.issueRefreshToken();
        Instant exp = Instant.now().plusSeconds(props.getRefreshExpirySeconds());
        refreshRepo.save(RefreshToken.issue(user.getId(), RefreshTokenUserType.ADMIN, issuer.hash(refresh), exp));
        return new AuthTokenResponse(access, refresh, user.getRole().name(),
            Instant.now().plusSeconds(props.getAccessExpirySeconds()));
    }
}
```

- [ ] **B5.4 — PasswordEncoder bean 등록 (`SecurityConfig.java`)**

```java
@Bean public PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
```

- [ ] **B5.5 — test 통과 확인 (PASS)**

- [ ] **B5.6 — commit**

```bash
git commit -m "feat(arologis-extract): AdminLoginService — loginId+password BCrypt + access/refresh 발급"
```

---

## BE Task B6: DriverLoginService (passwordless)

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/auth/DriverLoginService.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/DriverLoginRequest.java`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/auth/DriverLoginServiceTest.java`

- [ ] **B6.1 — test 작성 (failing)**

```java
@ExtendWith(MockitoExtension.class)
class DriverLoginServiceTest {
    @Mock DriverRepository driverRepo;
    @Mock RefreshTokenRepository refreshRepo;
    @Mock JwtIssuer issuer;
    @InjectMocks DriverLoginService svc;

    @Test
    void registered_phone_issues_jwt() {
        UUID id = UUID.randomUUID();
        Driver d = Driver.create("D001", "01012345678", "1톤", DriverSource.INTERNAL);
        ReflectionTestUtils.setField(d, "id", id);
        when(driverRepo.findByPhoneNumberAndIsDeletedFalse("01012345678")).thenReturn(Optional.of(d));
        when(issuer.issueAccessForDriver(id, "D001", "01012345678")).thenReturn("ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("REFRESH");
        when(issuer.hash("REFRESH")).thenReturn("RHASH");

        AuthTokenResponse res = svc.login(new DriverLoginRequest("01012345678"));
        assertThat(res.accessToken()).isEqualTo("ACCESS");
        assertThat(res.role()).isEqualTo("AROLOGIS_DRIVER");
    }

    @Test
    void unregistered_phone_throws_401() {
        when(driverRepo.findByPhoneNumberAndIsDeletedFalse(any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> svc.login(new DriverLoginRequest("01099999999")))
            .isInstanceOf(BadCredentialsException.class);
    }
}
```

- [ ] **B6.2 — DTO 작성**

```java
public record DriverLoginRequest(
    @NotBlank @Pattern(regexp = "^0\\d{9,10}$") String phoneNumber
) {}
```

- [ ] **B6.3 — Service 작성**

```java
@Service
@RequiredArgsConstructor
@Transactional
public class DriverLoginService {
    private final DriverRepository driverRepo;
    private final RefreshTokenRepository refreshRepo;
    private final JwtIssuer issuer;
    private final ArologisJwtProperties props;

    public AuthTokenResponse login(DriverLoginRequest req) {
        Driver d = driverRepo.findByPhoneNumberAndIsDeletedFalse(req.phoneNumber())
            .orElseThrow(() -> new BadCredentialsException("unregistered driver"));
        String access = issuer.issueAccessForDriver(d.getId(), d.getDriverCode(), d.getPhoneNumber());
        String refresh = issuer.issueRefreshToken();
        Instant exp = Instant.now().plusSeconds(props.getRefreshExpirySeconds());
        refreshRepo.save(RefreshToken.issue(d.getId(), RefreshTokenUserType.DRIVER, issuer.hash(refresh), exp));
        return new AuthTokenResponse(access, refresh, "AROLOGIS_DRIVER",
            Instant.now().plusSeconds(props.getAccessExpirySeconds()));
    }
}
```

- [ ] **B6.4 — test 통과 확인 (PASS)**

- [ ] **B6.5 — commit**

```bash
git commit -m "feat(arologis-extract): DriverLoginService — phoneNumber passwordless (사전 등록만 허용)"
```

---

## BE Task B7: RefreshTokenService (rotation)

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/auth/RefreshTokenService.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/RefreshRequest.java`
- Test: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/auth/RefreshTokenServiceTest.java`

- [ ] **B7.1 — test 작성 (failing)** — 4 case: 정상 rotation / 만료 / revoked / 미존재

(코드 동일 패턴 — 본문 길이 절감 위해 본 작성 시점에 RefreshTokenServiceTest 안에 4 case 모두 작성)

- [ ] **B7.2 — Service 작성**

```java
@Service @RequiredArgsConstructor @Transactional
public class RefreshTokenService {
    private final RefreshTokenRepository refreshRepo;
    private final AdminUserRepository adminRepo;
    private final DriverRepository driverRepo;
    private final JwtIssuer issuer;
    private final ArologisJwtProperties props;

    public AuthTokenResponse refresh(String oldRefresh) {
        String hash = issuer.hash(oldRefresh);
        RefreshToken existing = refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse(hash)
            .orElseThrow(() -> new BadCredentialsException("invalid refresh"));
        if (existing.getExpiresAt().isBefore(Instant.now())) {
            throw new BadCredentialsException("expired");
        }
        existing.revoke();  // rotation

        String newAccess; String role;
        if (existing.getUserType() == RefreshTokenUserType.ADMIN) {
            AdminUser u = adminRepo.findById(existing.getUserId())
                .orElseThrow(() -> new BadCredentialsException("user gone"));
            newAccess = issuer.issueAccessForAdmin(u.getId(), u.getLoginId(), u.getRole());
            role = u.getRole().name();
        } else {
            Driver d = driverRepo.findById(existing.getUserId())
                .orElseThrow(() -> new BadCredentialsException("driver gone"));
            newAccess = issuer.issueAccessForDriver(d.getId(), d.getDriverCode(), d.getPhoneNumber());
            role = "AROLOGIS_DRIVER";
        }
        String newRefresh = issuer.issueRefreshToken();
        Instant exp = Instant.now().plusSeconds(props.getRefreshExpirySeconds());
        refreshRepo.save(RefreshToken.issue(existing.getUserId(), existing.getUserType(), issuer.hash(newRefresh), exp));
        return new AuthTokenResponse(newAccess, newRefresh, role,
            Instant.now().plusSeconds(props.getAccessExpirySeconds()));
    }

    public void logout(String refresh) {
        refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse(issuer.hash(refresh))
            .ifPresent(RefreshToken::revoke);
    }
}
```

- [ ] **B7.3 — test 통과 확인 + commit**

```bash
git commit -m "feat(arologis-extract): RefreshTokenService — rotation + revoke + admin/driver 분기"
```

---

## BE Task B8: ArologisAuthController

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAuthController.java`
- Test: 이미 위 Service test 로 검증, 본 controller IT 는 B11 (ArologisAdminAuthIT) / B12 (ArologisDriverAuthIT) 에서.

- [ ] **B8.1 — Controller 작성**

```java
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class ArologisAuthController {
    private final AdminLoginService adminLogin;
    private final DriverLoginService driverLogin;
    private final RefreshTokenService refreshSvc;

    @PostMapping("/admin/login")
    public AuthTokenResponse adminLogin(@RequestBody @Valid AdminLoginRequest req) {
        return adminLogin.login(req);
    }

    @PostMapping("/driver/login")
    public AuthTokenResponse driverLogin(@RequestBody @Valid DriverLoginRequest req) {
        return driverLogin.login(req);
    }

    @PostMapping("/refresh")
    public AuthTokenResponse refresh(@RequestBody @Valid RefreshRequest req) {
        return refreshSvc.refresh(req.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestBody @Valid RefreshRequest req) {
        refreshSvc.logout(req.refreshToken());
    }

    @GetMapping("/me")
    public MeResponse me(@RequestHeader("X-User-Id") UUID userId,
                         @RequestHeader("X-User-Role") String role) {
        return new MeResponse(userId, role);
    }
}

public record RefreshRequest(@NotBlank String refreshToken) {}
public record MeResponse(UUID userId, String role) {}
```

- [ ] **B8.2 — SecurityConfig 갱신** — `/auth/**` permitAll, JwtFilter 추가

```java
@Bean
SecurityFilterChain filterChain(HttpSecurity http, ArologisJwtFilter jwtFilter, ...) throws Exception {
    return http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/auth/admin/login", "/auth/driver/login", "/auth/refresh").permitAll()
            .requestMatchers("/internal/**").hasAuthority("ROLE_MASTER")
            .requestMatchers("/admin/**").hasAnyAuthority("ROLE_AROLOGIS_MANAGER", "ROLE_AROLOGIS_MASTER")
            .requestMatchers("/driver-app/**").hasAuthority("ROLE_AROLOGIS_DRIVER")
            .requestMatchers("/auth/me", "/auth/logout").authenticated()
            .requestMatchers("/actuator/**").permitAll()
            .anyRequest().denyAll()
        )
        .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
        .build();
}
```

- [ ] **B8.3 — commit**

```bash
git commit -m "feat(arologis-extract): ArologisAuthController + SecurityConfig 권한 매핑 갱신"
```

---

## BE Task B9: ArologisJwtFilter + HeaderAuthenticationFilter 갱신

**Files:**
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/ArologisJwtFilter.java`
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/config/HeaderAuthenticationFilter.java`

- [ ] **B9.1 — ArologisJwtFilter 작성**

```java
@Component
@RequiredArgsConstructor
public class ArologisJwtFilter extends OncePerRequestFilter {
    private final JwtIssuer issuer;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String authz = req.getHeader("Authorization");
        if (authz != null && authz.startsWith("Bearer ")) {
            try {
                Claims claims = issuer.parse(authz.substring(7));
                UUID userId = UUID.fromString(claims.getSubject());
                String role = claims.get("role", String.class);
                // controller 호환 위해 X-User-* 헤더 주입 (기존 HeaderAuthenticationFilter 호환)
                var auth = new UsernamePasswordAuthenticationToken(userId, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + role)));
                SecurityContextHolder.getContext().setAuthentication(auth);
                req.setAttribute("X-User-Id", userId.toString());
                req.setAttribute("X-User-Role", role);
            } catch (JwtException e) {
                res.sendError(HttpStatus.UNAUTHORIZED.value(), "invalid jwt");
                return;
            }
        }
        chain.doFilter(req, res);
    }
}
```

- [ ] **B9.2 — HeaderAuthenticationFilter 갱신** — JwtFilter 우선, X-User-* 헤더가 SecurityContext 에 이미 있으면 skip. Internal endpoint (X-Internal-Token) 만 X-User-* 헤더로 보강.

- [ ] **B9.3 — commit**

```bash
git commit -m "feat(arologis-extract): ArologisJwtFilter — Bearer JWT 직접 검증 + X-User-* 헤더 주입"
```

---

## BE Task B10: UserClient 제거 + shared:user-client-abstraction 의존 제거

**Files:**
- Delete: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/UserClient.java`
- Modify: `services/arologis-service/build.gradle`
- 회귀: UserClient 를 import 하던 곳 grep + 자체 user 도메인으로 대체 (HeaderAuthenticationFilter 또는 service 안에서 user 검증이 있다면)

- [ ] **B10.1 — UserClient 의존 grep**

```bash
grep -r "UserClient" services/arologis-service/src/
```

- [ ] **B10.2 — 의존하는 코드 자체 UserService 또는 AuthService 호출로 변경**

- [ ] **B10.3 — UserClient.java 삭제 + build.gradle 의존 제거**

```gradle
// 제거: implementation project(':shared:user-client-abstraction')
```

- [ ] **B10.4 — 회귀 unit test 실행**

```bash
./gradlew :services:arologis-service:compileJava :services:arologis-service:compileTestJava
```
Expected: 컴파일 PASS

- [ ] **B10.5 — commit**

```bash
git commit -m "refactor(arologis-extract): UserClient 제거 + shared:user-client-abstraction 의존 제거 (자체 user 도메인 활용)"
```

---

## BE Task B11: Flyway V9 (dev seed MASTER)

**Files:**
- Create: `services/arologis-service/src/main/resources/db/migration/V9__seed_arologis_master.sql`

- [ ] **B11.1 — V9 작성**

```sql
-- V9__seed_arologis_master.sql
-- Dev seed only — prod 환경에서는 후속 migration 으로 password reset 의무.
-- password = '${QA_AROLOGIS_ADMIN_PASSWORD}' BCrypt strength 10
INSERT INTO auth_admin_user (id, login_id, password_hash, name, role, created_at, created_by, updated_at, updated_by, is_deleted)
VALUES (
    gen_random_uuid(),
    'admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- '${QA_AROLOGIS_ADMIN_PASSWORD}'
    '아로로지스 관리자',
    'AROLOGIS_MASTER',
    now(),
    'system',
    now(),
    'system',
    FALSE
)
ON CONFLICT DO NOTHING;
```

- [ ] **B11.2 — commit**

```bash
git commit -m "feat(arologis-extract): V9 dev seed — 초기 MASTER 계정 (admin/${QA_AROLOGIS_ADMIN_PASSWORD})"
```

---

## BE Task B12: ArologisAdminAuthIT (신규 IT 1)

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisAdminAuthIT.java`

- [ ] **B12.1 — IT 작성**

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class ArologisAdminAuthIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired AdminUserRepository userRepo;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper om;

    @MockBean PartnerClient partnerClient;
    @MockBean SlipClient slipClient;
    @MockBean NotificationClient notificationClient;
    @MockBean SlipServiceClient slipServiceClient;
    // UserClient @MockBean 제거됨 — 자체 user 도메인

    @BeforeEach
    void seed() {
        userRepo.save(AdminUser.create("itadmin", encoder.encode("pw1234"), "IT Admin", AdminUserRole.AROLOGIS_MASTER));
    }

    @Test
    void admin_login_then_call_admin_endpoint() throws Exception {
        // 1. login
        String body = om.writeValueAsString(new AdminLoginRequest("itadmin","pw1234"));
        String resJson = mvc.perform(post("/auth/admin/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        AuthTokenResponse tokens = om.readValue(resJson, AuthTokenResponse.class);
        assertThat(tokens.role()).isEqualTo("AROLOGIS_MASTER");

        // 2. /admin/arologis/dispatches 호출 (JWT bearer)
        mvc.perform(get("/admin/arologis/dispatches?date=2026-05-08&type=NIGHT")
                .header("Authorization", "Bearer " + tokens.accessToken()))
            .andExpect(status().isOk());
    }

    @Test
    void wrong_password_returns_401() throws Exception {
        String body = om.writeValueAsString(new AdminLoginRequest("itadmin","wrong"));
        mvc.perform(post("/auth/admin/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **B12.2 — Docker 가용 환경에서 실행 + commit**

```bash
git commit -m "test(arologis-extract): ArologisAdminAuthIT — admin login + admin endpoint 호출 IT"
```

---

## BE Task B13: ArologisDriverAuthIT (신규 IT 2)

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisDriverAuthIT.java`

- [ ] **B13.1 — IT 작성** (passwordless 검증)

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class ArologisDriverAuthIT extends AbstractPostgresIT {
    @Autowired MockMvc mvc;
    @Autowired DriverRepository driverRepo;
    @Autowired ObjectMapper om;

    @MockBean PartnerClient partnerClient;
    @MockBean SlipClient slipClient;
    @MockBean NotificationClient notificationClient;
    @MockBean SlipServiceClient slipServiceClient;

    @BeforeEach
    void seed() {
        Driver d = Driver.create("ITD001", "01011112222", "1톤", DriverSource.INTERNAL);
        driverRepo.save(d);
    }

    @Test
    void registered_phone_issues_driver_jwt() throws Exception {
        String body = om.writeValueAsString(new DriverLoginRequest("01011112222"));
        String res = mvc.perform(post("/auth/driver/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        AuthTokenResponse tokens = om.readValue(res, AuthTokenResponse.class);
        assertThat(tokens.role()).isEqualTo("AROLOGIS_DRIVER");

        // /driver-app/arologis/dispatches/today 호출 가능 확인
        mvc.perform(get("/driver-app/arologis/dispatches/today")
                .header("Authorization", "Bearer " + tokens.accessToken()))
            .andExpect(status().isOk());
    }

    @Test
    void unregistered_phone_returns_401() throws Exception {
        String body = om.writeValueAsString(new DriverLoginRequest("01099999999"));
        mvc.perform(post("/auth/driver/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void invalid_phone_format_returns_400() throws Exception {
        String body = om.writeValueAsString(new DriverLoginRequest("not-a-phone"));
        mvc.perform(post("/auth/driver/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
    }
}
```

- [ ] **B13.2 — commit**

```bash
git commit -m "test(arologis-extract): ArologisDriverAuthIT — phoneNumber passwordless + 미등록 401"
```

---

## BE Task B14: ArologisAuthSecurityIT + ArologisRefreshTokenIT (신규 IT 3+4)

**Files:**
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisAuthSecurityIT.java`
- Create: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisRefreshTokenIT.java`

- [ ] **B14.1 — ArologisAuthSecurityIT** — 4 case (만료 JWT / 잘못된 password / Soft Deleted Driver / 잘못된 role 차단)

- [ ] **B14.2 — ArologisRefreshTokenIT** — 4 case (정상 rotation / revoked 사용 / 만료 / 미존재)

- [ ] **B14.3 — commit**

```bash
git commit -m "test(arologis-extract): AuthSecurityIT + RefreshTokenIT — 8 보안 시나리오 회귀 가드"
```

---

## BE Task B15: 기존 IT 13 갱신 (UserClient @MockBean 제거)

**Files:**
- Modify: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/*.java` (13개)

- [ ] **B15.1 — grep**

```bash
grep -l "UserClient" services/arologis-service/src/test/
```

- [ ] **B15.2 — 각 IT 의 `@MockBean UserClient` 삭제 + setUp 의 `when(userClient.*)` stub 삭제**

- [ ] **B15.3 — 회귀 IT 13 실행**

```bash
./gradlew :services:arologis-service:test -i
```
Expected: 단위 + IT 합 ~37 case PASS (기존 33 + 신규 ~10 신규 unit/IT, B15 는 회귀 0 확인)

- [ ] **B15.4 — commit**

```bash
git commit -m "test(arologis-extract): 기존 IT 13 — UserClient @MockBean 제거 (자체 user 도메인 도입 회귀 가드)"
```

---

# Team 2: FE

## 파일 구조 (clients/arologis-desktop, clients/arologis-mobile)

### arologis-desktop (Electron + Vite + React, desktop 와 동일 stack)

```
clients/arologis-desktop/
├── package.json                 (별도 의존성, electron-builder 별도 app id)
├── electron/                    (desktop/electron 패턴 복제)
│   ├── main.ts
│   └── preload.ts
├── src/renderer/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── login/
│   │   │   └── LoginPage.tsx           (loginId + password)
│   │   ├── dispatches/                 (git mv from desktop/routes/arologis/*)
│   │   ├── drivers/
│   │   │   └── DriverManagementPage.tsx  (phoneNumber 사전 등록)
│   │   ├── regions/
│   │   └── audit/
│   ├── api/
│   │   ├── client.ts                   (axios baseURL = api.arologis.samhan-air.com)
│   │   ├── auth.ts                     (POST /auth/admin/login, /auth/refresh, /auth/logout)
│   │   ├── arologis.ts                 (모든 /admin/arologis/** 호출)
│   │   ├── partner.ts                  (partner-service via api.samhan-air.com)
│   │   └── notification.ts             (notification-service via api.samhan-air.com)
│   ├── components/
│   │   ├── AppLayout.tsx
│   │   └── ProtectedRoute.tsx
│   └── stores/
│       └── authStore.ts                (zustand or context — JWT 보관)
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### arologis-mobile (RN Expo, mobile-staff 와 동일 stack)

```
clients/arologis-mobile/
├── app.json                            (bundle id: com.samhanair.arologis.driver, expo)
├── package.json
├── src/
│   ├── App.tsx
│   ├── navigation/
│   │   └── RootNavigator.tsx           (login → dispatches stack)
│   ├── screens/
│   │   ├── PhoneLoginScreen.tsx        (휴대번호만, passwordless)
│   │   ├── DispatchListScreen.tsx
│   │   ├── DispatchDetailScreen.tsx
│   │   ├── GpsPermissionScreen.tsx     (foreground 의무, 거부 시 사용 불가)
│   │   └── SignatureScreen.tsx
│   ├── api/
│   │   ├── client.ts                   (axios baseURL = api.arologis.samhan-air.com)
│   │   ├── auth.ts                     (POST /auth/driver/login)
│   │   └── arologis.ts                 (/driver-app/arologis/**)
│   └── stores/
│       └── authStore.ts
└── eas.json                            (Expo EAS profile — production / preview / development)
```

---

## FE Task F1: arologis-desktop skeleton

**Files:**
- Create: `clients/arologis-desktop/package.json`, `tsconfig.json`, `vite.config.ts`, `electron/main.ts`, `electron/preload.ts`

- [ ] **F1.1 — 기존 desktop 의 package.json 복제 + app name/id 변경**

```json
{
  "name": "arologis-desktop",
  "productName": "Arologis Desktop",
  "version": "1.0.0",
  "main": "dist-electron/main.js",
  "build": {
    "appId": "com.samhanair.arologis.desktop",
    "productName": "Arologis Desktop",
    ...
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && electron-builder",
    "build:win": "tsc && vite build && electron-builder --win"
  }
}
```

- [ ] **F1.2 — electron/main.ts 작성 (BrowserWindow 단순 init, desktop 패턴 복제)**

- [ ] **F1.3 — npm install + smoke build**

```bash
cd clients/arologis-desktop && npm install && npm run build
```

- [ ] **F1.4 — commit**

```bash
git commit -m "feat(arologis-extract): arologis-desktop skeleton — Electron + Vite + React (desktop 패턴 복제)"
```

---

## FE Task F2: git mv routes/arologis → arologis-desktop/routes/dispatches

**Files:**
- Source: `clients/desktop/src/renderer/routes/arologis/`
- Target: `clients/arologis-desktop/src/renderer/routes/dispatches/`

- [ ] **F2.1 — git mv 실행**

```bash
git mv clients/desktop/src/renderer/routes/arologis clients/arologis-desktop/src/renderer/routes/dispatches
```

- [ ] **F2.2 — import path 갱신**

이전된 파일들의 import 가 `clients/desktop/...` 경로를 가리키면 본 폴더 내 상대 경로로 정정. grep + Edit 활용:

```bash
grep -rn "@desktop/" clients/arologis-desktop/src/renderer/routes/dispatches/
```

- [ ] **F2.3 — vite build 성공 확인**

- [ ] **F2.4 — commit**

```bash
git commit -m "refactor(arologis-extract): clients/desktop/routes/arologis → clients/arologis-desktop/routes/dispatches (git mv)"
```

---

## FE Task F3: arologis-desktop 의 LoginPage (admin)

**Files:**
- Create: `clients/arologis-desktop/src/renderer/routes/login/LoginPage.tsx`
- Create: `clients/arologis-desktop/src/renderer/api/auth.ts`
- Create: `clients/arologis-desktop/src/renderer/api/client.ts`
- Create: `clients/arologis-desktop/src/renderer/stores/authStore.ts`

- [ ] **F3.1 — api/client.ts** (axios baseURL + interceptor)

```ts
import axios from "axios";
import { useAuthStore } from "../stores/authStore";

export const api = axios.create({ baseURL: import.meta.env.VITE_AROLOGIS_API_BASE });
api.interceptors.request.use((cfg) => {
  const token = useAuthStore.getState().accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
```

- [ ] **F3.2 — api/auth.ts**

```ts
export async function adminLogin(loginId: string, password: string) {
  const { data } = await api.post("/auth/admin/login", { loginId, password });
  return data as { accessToken: string; refreshToken: string; role: string; expiresAt: string };
}
export async function refresh(refreshToken: string) {
  const { data } = await api.post("/auth/refresh", { refreshToken });
  return data;
}
export async function logout(refreshToken: string) {
  await api.post("/auth/logout", { refreshToken });
}
```

- [ ] **F3.3 — stores/authStore.ts** (zustand 패턴)

- [ ] **F3.4 — LoginPage.tsx 작성** (form: loginId + password + submit → adminLogin → setTokens → navigate("/dispatches"))

- [ ] **F3.5 — commit**

```bash
git commit -m "feat(arologis-extract): arologis-desktop LoginPage (loginId + password) + authStore"
```

---

## FE Task F4: arologis-desktop DriverManagementPage (phoneNumber 사전 등록)

**Files:**
- Create: `clients/arologis-desktop/src/renderer/routes/drivers/DriverManagementPage.tsx`
- Create: `clients/arologis-desktop/src/renderer/api/arologis.ts`

- [ ] **F4.1 — api/arologis.ts** — `/admin/arologis/drivers` CRUD 호출

- [ ] **F4.2 — DriverManagementPage.tsx** — list / create form (driverCode + phoneNumber + vehicleType) / soft delete

- [ ] **F4.3 — commit**

```bash
git commit -m "feat(arologis-extract): arologis-desktop DriverManagementPage — phoneNumber 사전 등록 (passwordless)"
```

---

## FE Task F5: arologis-mobile skeleton + git mv driver 화면

**Files:**
- Create: `clients/arologis-mobile/package.json`, `app.json`, `eas.json`, `src/App.tsx`, `src/navigation/RootNavigator.tsx`
- Source: `clients/mobile-staff/src/screens/driver/` (있다면 — grep 으로 확인)
- Target: `clients/arologis-mobile/src/screens/`

- [ ] **F5.1 — mobile-staff 의 stack 복제**

```json
{
  "name": "arologis-mobile",
  "expo": {
    "name": "아로로지스 기사",
    "slug": "arologis-driver",
    "android": { "package": "com.samhanair.arologis.driver" },
    "ios": { "bundleIdentifier": "com.samhanair.arologis.driver" }
  }
}
```

- [ ] **F5.2 — grep + git mv driver 화면**

```bash
grep -rln "arologis" clients/mobile-staff/src/screens/
# 매칭된 폴더/파일 → git mv ... clients/arologis-mobile/src/screens/
```

- [ ] **F5.3 — commit**

```bash
git commit -m "feat(arologis-extract): arologis-mobile skeleton + git mv mobile-staff/driver/*"
```

---

## FE Task F6: arologis-mobile PhoneLoginScreen (passwordless)

**Files:**
- Create: `clients/arologis-mobile/src/screens/PhoneLoginScreen.tsx`
- Create: `clients/arologis-mobile/src/api/auth.ts`
- Create: `clients/arologis-mobile/src/api/client.ts`
- Create: `clients/arologis-mobile/src/stores/authStore.ts`

- [ ] **F6.1 — api/auth.ts**

```ts
export async function driverLogin(phoneNumber: string) {
  const { data } = await api.post("/auth/driver/login", { phoneNumber });
  return data;
}
```

- [ ] **F6.2 — PhoneLoginScreen.tsx** — TextInput (keyboardType="phone-pad") + button → driverLogin → setTokens → navigate("DispatchList"). 미등록 시 alert "등록되지 않은 번호입니다. 관리자에게 문의하세요."

- [ ] **F6.3 — commit**

```bash
git commit -m "feat(arologis-extract): arologis-mobile PhoneLoginScreen — passwordless 본인 번호"
```

---

## FE Task F7: arologis-mobile GpsPermissionScreen (foreground 의무)

- [ ] **F7.1 — expo-location foreground 권한 요청 + 거부 시 차단 화면 노출**

- [ ] **F7.2 — commit**

```bash
git commit -m "feat(arologis-extract): arologis-mobile GpsPermissionScreen — foreground 거부 시 사용 불가"
```

---

# Team 3: Designer

## Designer Task D1: arologis-desktop LoginPage mock

**Files:**
- Create: `docs/uiux/arologis-extract/01-desktop-login.md`
- Create: `docs/uiux/arologis-extract/screenshots/01-desktop-login.png`

- [ ] **D1.1 — Figma or ASCII mock** — 중앙 카드, 아로로지스 로고, loginId input, password input, "로그인" 버튼, 에러 메시지 영역
- [ ] **D1.2 — UI 의 CSS class / 색상 / spacing 정의 + Tailwind 토큰 명시**
- [ ] **D1.3 — commit**

```bash
git commit -m "docs(arologis-extract): Designer D1 — arologis-desktop LoginPage mock + 색상 토큰"
```

---

## Designer Task D2~D5

(동일 구조: PhoneLoginScreen / GpsPermissionScreen / DriverManagementPage / installer 다운로드 페이지 / store 페이지)

각 task = mock + 색상/spacing + commit. 총 5 commit.

---

# Team 4: QA

## QA Task Q1: 6 시나리오 절차 작성

**Files:**
- Create: `docs/qa/arologis-extract/scenarios.md`

- [ ] **Q1.1 — 6 시나리오 step-by-step 절차 + 예상 결과 + 검증 SQL** (spec §10.3 표 6 시나리오 그대로 + 각 case 별 SQL/명령)

예시 (시나리오 4):
```sql
-- 같은 Eureka 에 14 + 1 service 등록 확인
SELECT app_name, instance_id, status
FROM eureka_instances
ORDER BY app_name;
-- Expected: 15 행 (14 Samhan Public + 1 arologis-service)
```

- [ ] **Q1.2 — commit**

```bash
git commit -m "docs(arologis-extract): QA Q1 — 6 시나리오 절차 + 검증 SQL"
```

---

## QA Task Q2: 회귀 33 case 검증 절차

- [ ] **Q2.1 — `./gradlew :services:arologis-service:test` 후 단위 + IT 결과 비교 절차 작성 (before/after diff)** — `docs/qa/arologis-extract/regression-33-case.md`
- [ ] **Q2.2 — commit**

---

## QA Task Q3: 롤백 절차 dry-run runbook

- [ ] **Q3.1 — spec §10.4 의 5 단계 각각 dry-run 명령 + 예상 결과** — `docs/qa/arologis-extract/rollback-dry-run.md`
- [ ] **Q3.2 — commit**

---

# Team 5: DevOps

## DevOps Task DO1: arologis-ci.yml workflow

**Files:**
- Create: `.github/workflows/arologis-ci.yml`

- [ ] **DO1.1 — workflow 작성**

```yaml
name: arologis CI

on:
  pull_request:
    paths:
      - 'services/arologis-service/**'
      - 'clients/arologis-desktop/**'
      - 'clients/arologis-mobile/**'
      - 'shared/**'
      - '.github/workflows/arologis-ci.yml'
  push:
    branches: [main]
    paths:
      - 'services/arologis-service/**'
      - 'clients/arologis-desktop/**'
      - 'clients/arologis-mobile/**'
      - 'shared/**'

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports: [5432:5432]
        options: --health-cmd pg_isready
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }
      - run: ./gradlew :services:arologis-service:test :services:arologis-service:bootJar -i
      - uses: actions/upload-artifact@v4
        with:
          name: arologis-jar
          path: services/arologis-service/build/libs/arologis-service.jar

  desktop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd clients/arologis-desktop && npm ci && npm run build

  mobile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd clients/arologis-mobile && npm ci && npx expo prebuild --no-install --platform android
```

- [ ] **DO1.2 — commit**

```bash
git commit -m "ci(arologis-extract): arologis-ci.yml — BE 테스트 + Desktop/Mobile 빌드 (path filter 분리)"
```

---

## DevOps Task DO2: samhanlogis-ci.yml path filter 갱신

**Files:**
- Modify: `.github/workflows/samhanlogis-ci.yml` (또는 동등한 기존 workflow)

- [ ] **DO2.1 — services/arologis-service/** + clients/arologis-*/** 제외 path 추가**

```yaml
paths:
  - 'services/**'
  - 'clients/desktop/**'
  - 'clients/mobile-staff/**'
  - '!services/arologis-service/**'
  - '!clients/arologis-desktop/**'
  - '!clients/arologis-mobile/**'
```

- [ ] **DO2.2 — commit**

```bash
git commit -m "ci(arologis-extract): samhanlogis-ci path filter — arologis 제외 (분리 workflow 분담)"
```

---

## DevOps Task DO3: arologis-deploy.yml

**Files:**
- Create: `.github/workflows/arologis-deploy.yml`

- [ ] **DO3.1 — workflow 작성** — tag `arologis-v*` push trigger + EC2 ssh + docker-compose pull + up -d + health check

```yaml
name: arologis Deploy
on:
  push:
    tags: ['arologis-v*']
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '17', distribution: 'temurin' }
      - run: ./gradlew :services:arologis-service:bootJar
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - run: |
          docker build -t ghcr.io/${{ github.repository_owner }}/samhanpublic/arologis-service:${{ github.ref_name }} -f services/arologis-service/Dockerfile services/arologis-service/
          docker push ghcr.io/${{ github.repository_owner }}/samhanpublic/arologis-service:${{ github.ref_name }}
      - name: Deploy to EC2
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.AROLOGIS_EC2_HOST }}
          username: ${{ secrets.AROLOGIS_EC2_USER }}
          key: ${{ secrets.AROLOGIS_EC2_KEY }}
          script: |
            cd /opt/arologis
            docker-compose -f docker-compose.arologis.yml pull
            docker-compose -f docker-compose.arologis.yml up -d
            sleep 10
            curl -fsS http://localhost:8097/actuator/health || exit 1
```

- [ ] **DO3.2 — commit**

```bash
git commit -m "ci(arologis-extract): arologis-deploy.yml — tag arologis-v* trigger + EC2 ssh deploy + health check"
```

---

## DevOps Task DO4: docker-compose.arologis.yml

**Files:**
- Create: `infrastructure/docker/docker-compose.arologis.yml`

- [ ] **DO4.1 — compose 작성** (spec §8.4 그대로)

- [ ] **DO4.2 — Dockerfile (`services/arologis-service/Dockerfile`) 존재 확인 — 없으면 추가**

```dockerfile
FROM eclipse-temurin:17-jre
COPY build/libs/arologis-service.jar /app.jar
EXPOSE 8097
ENTRYPOINT ["java","-jar","/app.jar"]
```

- [ ] **DO4.3 — commit**

```bash
git commit -m "ci(arologis-extract): docker-compose.arologis.yml + Dockerfile (samhan-net 공유)"
```

---

## DevOps Task DO5: Route53 + Nginx + Terraform (또는 manual runbook)

**Files:**
- Create: `infrastructure/terraform/arologis.tf` (Route53 3 record)
- Create: `infrastructure/nginx/arologis.conf` (host-header 라우팅)
- Create: `docs/migration/arologis-extract/04-aws-deployment.md` (이미 §9 에 listed — 본 task 가 작성 주체)

- [ ] **DO5.1 — Terraform Route53 record 3개** — api / app / mobile

- [ ] **DO5.2 — Nginx config 4 server block** (spec §8.3 그대로)

- [ ] **DO5.3 — commit**

```bash
git commit -m "ci(arologis-extract): Route53 3 record + Nginx host-header 라우팅 + AWS deployment guide"
```

---

## DevOps Task DO6: EC2 Auto Recovery Lambda 영향 0 검증

**Files:**
- Modify: `infrastructure/scripts/phase11-deploy.ps1` (필요 시)
- Create: `docs/migration/arologis-extract/06-ec2-recovery-impact.md`

- [ ] **DO6.1 — Health Check Lambda 의 endpoint 목록에 `http://arologis-service:8097/actuator/health` 추가** (또는 없으면 별도 alarm 만)
- [ ] **DO6.2 — Auto Recovery action 검증 절차 작성**
- [ ] **DO6.3 — commit**

```bash
git commit -m "ci(arologis-extract): EC2 Auto Recovery + Health Check Lambda — arologis-service health 추가"
```

---

# Team 6: TM (Integration)

## TM Task T1: BE + FE 컴파일 검증

- [ ] **T1.1 — 5-team 완료 후 fresh clone or branch checkout**

```bash
git fetch origin && git checkout <feature-branch>
./gradlew :services:arologis-service:assemble :services:arologis-service:test
cd clients/arologis-desktop && npm ci && npm run build
cd clients/arologis-mobile && npm ci && npx expo prebuild --no-install --platform android
```

Expected: 모두 PASS

- [ ] **T1.2 — fail 발생 시 해당 팀에 fix 요청** ([[feedback_pm_integration_build_check]])

---

## TM Task T2: shared 모듈 회귀 가드

- [ ] **T2.1 — Samhan Public 14 service 빌드**

```bash
./gradlew build -x :services:arologis-service:build
```

- [ ] **T2.2 — fail 시 shared:user-client-abstraction 제거가 다른 service 영향 0 검증**

---

## TM Task T3: 문서 동기화

- [ ] **T3.1 — `README.md` (root) 갱신** — "Samhan Public 14 service + 아로로지스 (독립 서비스)"
- [ ] **T3.2 — `ROADMAP.md` 갱신** — Phase 10.5 milestone
- [ ] **T3.3 — `services/arologis-service/README.md` 갱신** — 자체 auth/user + 3 client (UserClient 제거)
- [ ] **T3.4 — `migration/decisions/DECISIONS.md` 9 entry 추가** (D-AX-01~09)
- [ ] **T3.5 — `CLAUDE.md` 갱신** — 명칭 규칙 + 신규 메모리 링크
- [ ] **T3.6 — commit**

```bash
git commit -m "docs(arologis-extract): TM T3 — root 문서 동기화 (README/ROADMAP/DECISIONS/CLAUDE/service README)"
```

---

## TM Task T4: 메모리 sync

**Files:**
- Create: `.claude/memory/project_arologis_independent.md` (repo 안)
- Modify: `.claude/memory/MEMORY.md`
- 사용자 홈 메모리 `feedback_arologis_name.md`, `feedback_samhan_public_name.md` 를 repo `.claude/memory/` 로 복사

- [ ] **T4.1 — repo `.claude/memory/` 에 3 신규 메모리 + MEMORY.md 갱신**
- [ ] **T4.2 — `scripts/sync-claude-memory.ps1` 실행 확인** (repo → 사용자 홈 단방향)
- [ ] **T4.3 — commit**

```bash
git commit -m "docs(arologis-extract): TM T4 — 메모리 sync (3 신규 + MEMORY.md + 양 PC 동기화)"
```

---

## TM Task T5: 통합 PR 발행

- [ ] **T5.1 — 5-team 모든 commit + TM T1~T4 동일 branch 에 통합**
- [ ] **T5.2 — `gh pr create` 본문 작성** ([[feedback_korean_commits]] 한국어, [[feedback_pr_qa_screenshots]] QA 캡처 6장 인라인)

```bash
gh pr create --title "feat(arologis-extract): 아로로지스 독립 서비스 분리 — 단일 통합 PR" \
  --body "$(cat <<'EOF'
## 개요

Samhan Public monorepo 의 arologis-service 를 독립 운영 단위로 분리. 같은 AWS 환경 공유 + service-to-service 통신 유지 + 자체 auth/user 도메인 + 기사 휴대번호 passwordless.

연관 spec: `docs/superpowers/specs/2026-05-14-arologis-extract-design.md`
연관 plan: `docs/superpowers/plans/2026-05-14-arologis-extract.md`

## 9개 핵심 결정 (D-AX-01~09)

(spec §2 그대로)

## 5-team 산출

(spec §11.1 + 각 팀 commit 요약)

## QA 시나리오 (6장 인라인 캡처)

![scenario-1-admin-login](docs/qa/arologis-extract/screenshots/01-admin-login.png)
![scenario-2-driver-crud](docs/qa/arologis-extract/screenshots/02-driver-crud.png)
![scenario-3-mobile-phone-login](docs/qa/arologis-extract/screenshots/03-mobile-phone-login.png)
![scenario-4-eureka-15-services](docs/qa/arologis-extract/screenshots/04-eureka.png)
![scenario-5-route53-nginx](docs/qa/arologis-extract/screenshots/05-route53.png)
![scenario-6-docker-isolation](docs/qa/arologis-extract/screenshots/06-docker-isolation.png)

## 롤백 절차

5 단계 reversible — 본문 `docs/migration/arologis-extract/05-rollback-runbook.md` 참조.

## 영향 검증

- 단위 + IT 회귀 33 case 0 결함
- 신규 IT 4 case (admin/driver/security/refresh) PASS
- Samhan Public 14 service 회귀 0
- AWS 비용 변경 0

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Team 7: PM (CI 모니터링 + 머지 요청)

## PM Task P1: gh pr checks --watch

- [ ] **P1.1 — PR 발행 즉시 `gh pr checks --watch` 자동 시작** ([[feedback_pr_ci_monitoring]] + [[feedback_monitor_no_permission]])
- [ ] **P1.2 — fail 시 즉시 해당 팀에게 fix 요청**

---

## PM Task P2: green 후 개발책임자 머지 요청

- [ ] **P2.1 — CI green + 5-team 0결함 확인**
- [ ] **P2.2 — PM 자동 승인 ([[feedback_user_merge_authority]]) 후 개발책임자에게 머지 요청**

```
@개발책임자: 통합 PR #XXX 이 5-team 0결함 + CI green 입니다. 머지 부탁드립니다.
- 아로로지스 독립 서비스 분리 완료
- D-AX-01~09 (9 결정) 반영
- 회귀 33 + 신규 IT 4 = 37 case PASS
- 비용 변경 0
```

---

# 실행 순서 요약

```
[병렬 디스패치]
  ├── BE Team:        B1 → B2 → … → B15  (15 task)
  ├── FE Team:        F1 → F2 → … → F7   (7 task)
  ├── Designer Team:  D1 → D2 → … → D5   (5 task)
  ├── QA Team:        Q1 → Q2 → Q3       (3 task)
  └── DevOps Team:    DO1 → DO2 → … → DO6 (6 task)

[병렬 완료 후 sequential]
  └── TM:             T1 → T2 → T3 → T4 → T5  (5 task)
      └── PM:         P1 → P2  (2 task)
          └── 개발책임자 머지
```

---

# Self-review 결과

- [x] **Spec coverage**: spec 의 §3~§11 각각 task 매핑 (§3 아키텍처 = 다이어그램 only, §4 build = DO1+DO2+F1+F5, §5 통신 = B10, §6 auth = B1~B14, §7 client = F1~F7, §8 AWS = DO3~DO5, §9 docs = T3, §10 test = B12~B15 + Q1~Q3, §11 5-team = 본 plan 전체).
- [x] **Placeholder scan**: D2~D5 가 "동일 구조" 로 압축 — Designer 가 5 화면별 mock 만들기 작업 명확하므로 OK. 다른 task 는 모두 코드/명령 명시.
- [x] **Type consistency**: `AuthTokenResponse` (B5/B6/B7/B12/B13), `AdminUserRole` (B1/B4/B5), `RefreshTokenUserType` (B2/B7), `Driver.findByPhoneNumberAndIsDeletedFalse` (B3/B6/B13) — 일관.
