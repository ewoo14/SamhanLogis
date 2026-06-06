package com.samhanair.logis.common.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;

/**
 * Stateless HS256 JWT issuer/parser — jjwt 0.12.x fluent API.
 *
 * <p>Phase 12 인사 카테고리 가드 슬라이스:
 * {@code departmentName} claim 을 JWT 에 포함하여 api-gateway 가
 * {@code X-User-Department} 헤더로 downstream 에 전파할 수 있도록 확장.
 * 기존 {@link #generate(String, String, long, byte[])} 는 하위 호환 유지.
 *
 * <p>Phase C4 MASTER bypass 클레임:
 * {@code isSystemMaster} claim 을 JWT 에 포함하여 api-gateway 가
 * {@code X-Is-System-Master} 헤더로 downstream 에 전파.
 * {@link PermissionAspect} 에서 OR 폴백(role==MASTER)과 함께 bypass 판정에 사용.
 * 기존 오버로드는 모두 하위 호환 유지.
 *
 * <p>Phase C5-1 그룹 집합 전파 인프라:
 * {@code groups} claim (comma-join UUID 문자열) 을 JWT 에 포함하여 api-gateway 가
 * {@code X-User-Groups} 헤더로 downstream 에 전파.
 * 본 슬라이스에서는 전파만 수행하며 소비처는 C5-2 에서 구현한다.
 * 기존 6-arg 오버로드는 groups="" 위임으로 하위 호환 유지.
 *
 * <p>Phase C5-4 role 클레임 제거:
 * Samhan 발급 경로({@code auth-service})는 {@link #generate(String, String, String, boolean, String, long, byte[])} 에서
 * role 클레임을 더 이상 포함하지 않는다. partner-auth 발급 경로는 {@code partnerCode} claim 으로 식별한다.
 * {@link #getRole(Jws)} 는 잔존 토큰 하위 호환 및 arologis 독립 경로를 위해 유지되나 신규 발급에서는 사용하지 않는다.
 * {@link #generateForPartner(String, String, long, byte[])} 를 파트너 JWT 발급 전용 메서드로 신설한다.
 */
public final class JwtTokenProvider {

    /** JWT claim key — 부서명 (한국어 문자열, 예: "대표실"). */
    public static final String CLAIM_DEPARTMENT_NAME = "departmentName";

    /**
     * JWT claim key — 파트너(거래처) 코드 (Phase C5-4 신규).
     *
     * <p>partner-auth-service 발급 JWT 에만 포함된다.
     * api-gateway 가 이 claim 존재 시 {@code X-Is-Partner: true} 헤더를 주입한다.
     * 값은 거래처 코드 문자열 (예: {@code "P001"}).
     */
    public static final String CLAIM_PARTNER_CODE = "partnerCode";

    /**
     * JWT claim key — 시스템 마스터 그룹 멤버십 여부 (Phase C4).
     *
     * <p>값이 {@code true} 이면 해당 계정이 {@code is_system_master=true} 인 권한그룹에 배속되어
     * 있음을 의미한다. api-gateway 가 {@code X-Is-System-Master: true} 헤더로 전파한다.
     */
    public static final String CLAIM_IS_SYSTEM_MASTER = "isSystemMaster";

    /**
     * JWT claim key — 계정의 활성 그룹 UUID 집합 (Phase C5-1).
     *
     * <p>값은 그룹 UUID 를 쉼표로 join 한 문자열이다 (예: {@code "uuid1,uuid2,uuid3"}).
     * api-gateway 가 {@code X-User-Groups} 헤더로 downstream 에 전파한다.
     * 본 슬라이스(C5-1)에서는 전파만 수행하며, 소비처(PermissionAspect 등)는 C5-2 에서 구현된다.
     * 그룹이 없거나 빈 문자열이면 claim 을 포함하지 않는다.
     */
    public static final String CLAIM_GROUPS = "groups";

    private JwtTokenProvider() {
    }

    /**
     * 기존 발급 메서드 — departmentName 미포함 (하위 호환).
     *
     * @param userId     사용자 UUID 문자열
     * @param role       역할 문자열 (예: "MASTER")
     * @param ttlSeconds 만료 시간(초)
     * @param secret     HS256 서명 secret bytes
     * @return 서명된 JWT 문자열
     */
    public static String generate(String userId, String role, long ttlSeconds, byte[] secret) {
        return generate(userId, role, null, ttlSeconds, secret);
    }

    /**
     * departmentName claim 포함 발급 메서드 (isSystemMaster 미포함 — 하위 호환).
     *
     * <p>Phase 12 인사 가드: auth-service 로그인 시 user-service 에서 조회한
     * 부서명을 JWT claim 에 포함. api-gateway 가 {@code X-User-Department} 헤더로 전파.
     *
     * @param userId         사용자 UUID 문자열
     * @param role           역할 문자열 (예: "MASTER")
     * @param departmentName 소속 부서명 (null 허용 — 미설정 시 claim 미포함)
     * @param ttlSeconds     만료 시간(초)
     * @param secret         HS256 서명 secret bytes
     * @return 서명된 JWT 문자열
     */
    public static String generate(String userId, String role, String departmentName,
                                  long ttlSeconds, byte[] secret) {
        return generate(userId, role, departmentName, false, ttlSeconds, secret);
    }

    /**
     * isSystemMaster claim 포함 발급 메서드 — Phase C4 신규 오버로드 (groups 미포함 — 하위 호환).
     *
     * <p>auth-service 로그인 시 {@code is_system_master=true} 권한그룹 멤버십을
     * JWT claim 에 포함. api-gateway 가 {@code X-Is-System-Master} 헤더로 전파하여
     * downstream {@link PermissionAspect} 에서 빠른 bypass 판정에 사용한다.
     *
     * <p>기존 role=="MASTER" 폴백은 유지(OR) — 락아웃 0 설계.
     * 헤더 파이프가 깨져도 role 폴백이 MASTER 접근을 보존한다.
     *
     * <p>Phase C5-1: 내부적으로 7-arg 오버로드에 {@code groups=""} 로 위임하여 하위 호환을 유지한다.
     *
     * @param userId         사용자 UUID 문자열
     * @param role           역할 문자열 (예: "MASTER")
     * @param departmentName 소속 부서명 (null 허용 — 미설정 시 claim 미포함)
     * @param isSystemMaster 시스템 마스터 그룹 멤버십 여부 (false 이면 claim 미포함)
     * @param ttlSeconds     만료 시간(초)
     * @param secret         HS256 서명 secret bytes
     * @return 서명된 JWT 문자열
     */
    public static String generate(String userId, String role, String departmentName,
                                  boolean isSystemMaster, long ttlSeconds, byte[] secret) {
        return generate(userId, role, departmentName, isSystemMaster, "", ttlSeconds, secret);
    }

    /**
     * groups claim 포함 발급 메서드 — Phase C5-1 신규 7-arg 오버로드.
     *
     * <p>Phase C5-4: role 클레임을 JWT 에서 제거한다. auth-service 로그인 시
     * isSystemMaster / groups / departmentName 만 포함하며, role 문자열은 더 이상 포함하지 않는다.
     * 인가 경로에서 role 이 완전히 소멸되므로 {@code role} 파라미터는 소스 계약 호환을 위해
     * 시그니처에만 잔존하나 JWT 본문에 기록하지 않는다 — Javadoc deprecated 경고.
     *
     * <p>기존 오버로드 시그니처는 모두 보존 — backward compat.
     *
     * @param userId         사용자 UUID 문자열
     * @param role           역할 문자열 — Phase C5-4 이후 JWT 에 포함하지 않음 (시그니처 유지용)
     * @param departmentName 소속 부서명 (null 허용 — 미설정 시 claim 미포함)
     * @param isSystemMaster 시스템 마스터 그룹 멤버십 여부 (false 이면 claim 미포함)
     * @param groups         활성 그룹 UUID comma-join 문자열 (null 또는 blank 이면 claim 미포함)
     * @param ttlSeconds     만료 시간(초)
     * @param secret         HS256 서명 secret bytes
     * @return 서명된 JWT 문자열
     */
    public static String generate(String userId, String role, String departmentName,
                                  boolean isSystemMaster, String groups,
                                  long ttlSeconds, byte[] secret) {
        SecretKey key = Keys.hmacShaKeyFor(secret);
        Instant now = Instant.now();
        // Phase C5-4: role 클레임 제거 — 인가 경로에서 role 완전 소멸.
        // role 파라미터는 소스 계약 호환을 위해 시그니처에만 잔존하며 JWT 본문에 포함하지 않는다.
        var builder = Jwts.builder()
                .subject(userId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key, Jwts.SIG.HS256);
        if (departmentName != null && !departmentName.isBlank()) {
            builder.claim(CLAIM_DEPARTMENT_NAME, departmentName);
        }
        if (isSystemMaster) {
            builder.claim(CLAIM_IS_SYSTEM_MASTER, true);
        }
        if (groups != null && !groups.isBlank()) {
            builder.claim(CLAIM_GROUPS, groups);
        }
        return builder.compact();
    }

    /**
     * 파트너(거래처) JWT 발급 메서드 — Phase C5-4 신규.
     *
     * <p>partner-auth-service 전용 발급 경로. Samhan 직원 JWT 와의 구분 신원 근거로
     * {@code partnerCode} claim 을 포함한다. api-gateway 가 이 claim 존재 시
     * {@code X-Is-Partner: true} 헤더를 downstream 에 주입하여 {@link PermissionAspect} 의
     * PARTNER 거절 판정에 사용된다.
     *
     * <p>role 클레임은 포함하지 않는다 (Phase C5-4 role 와이어 제거 일관).
     *
     * @param partnerId   파트너 계정 UUID 문자열 (JWT sub)
     * @param partnerCode 거래처 코드 (예: "P001") — {@code partnerCode} claim 으로 포함
     * @param ttlSeconds  만료 시간(초)
     * @param secret      HS256 서명 secret bytes
     * @return 서명된 JWT 문자열
     */
    public static String generateForPartner(String partnerId, String partnerCode,
                                            long ttlSeconds, byte[] secret) {
        SecretKey key = Keys.hmacShaKeyFor(secret);
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(partnerId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key, Jwts.SIG.HS256);
        if (partnerCode != null && !partnerCode.isBlank()) {
            builder.claim(CLAIM_PARTNER_CODE, partnerCode);
        }
        return builder.compact();
    }

    /**
     * partnerCode claim 추출 — Phase C5-4 신규.
     *
     * <p>api-gateway 에서 {@code X-Is-Partner: true} 헤더 주입 여부 판정에 사용.
     * claim 미포함(Samhan 직원 토큰 또는 구버전 파트너 토큰) 시 null 반환.
     *
     * @param jws 파싱된 JWS
     * @return 거래처 코드 문자열 또는 null
     */
    public static String getPartnerCode(Jws<Claims> jws) {
        return jws.getPayload().get(CLAIM_PARTNER_CODE, String.class);
    }

    /**
     * JWT 서명 검증 + 파싱.
     *
     * @param token  Bearer 토큰 (raw, "Bearer " prefix 제거 후)
     * @param secret HS256 서명 secret bytes
     * @return 검증된 {@link Jws}
     */
    public static Jws<Claims> parse(String token, byte[] secret) {
        SecretKey key = Keys.hmacShaKeyFor(secret);
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token);
    }

    /**
     * 사용자 ID (JWT subject) 추출.
     *
     * @param jws 파싱된 JWS
     * @return 사용자 UUID 문자열
     */
    public static String getUserId(Jws<Claims> jws) {
        return jws.getPayload().getSubject();
    }

    /**
     * role claim 추출.
     *
     * <p>Phase C5-4: Samhan 발급 JWT 에서 role 클레임이 제거되었다.
     * 이 메서드는 아래 두 경우에만 유효한 값을 반환한다:
     * <ol>
     *   <li>arologis-service 자체 JWT (독립 운영 단위, {@code AROLOGIS_*} role 포함)</li>
     *   <li>C5-4 이전에 발급된 잔존 토큰 (TTL 만료까지 폴백 호환)</li>
     * </ol>
     * 신규 Samhan/Partner JWT 에는 role claim 이 없으므로 null 반환.
     * arologis 외 경로에서는 이 메서드를 사용하지 않는다.
     *
     * @deprecated Phase C5-4 이후 Samhan/Partner JWT 에는 role 클레임 없음.
     *             arologis 전용 — 신규 코드에서 이 메서드 호출 금지.
     * @param jws 파싱된 JWS
     * @return 역할 문자열 (arologis 또는 잔존 토큰) 또는 null
     */
    @Deprecated
    public static String getRole(Jws<Claims> jws) {
        return jws.getPayload().get("role", String.class);
    }

    /**
     * departmentName claim 추출.
     *
     * <p>Phase 12 인사 가드: api-gateway 에서 {@code X-User-Department} 헤더 전파에 사용.
     * 구버전 토큰(claim 미포함) 은 null 반환.
     *
     * @param jws 파싱된 JWS
     * @return 부서명 문자열 또는 null
     */
    public static String getDepartmentName(Jws<Claims> jws) {
        return jws.getPayload().get(CLAIM_DEPARTMENT_NAME, String.class);
    }

    /**
     * isSystemMaster claim 추출 — Phase C4 신규.
     *
     * <p>api-gateway 에서 {@code X-Is-System-Master} 헤더 전파에 사용.
     * claim 미포함(구버전 토큰 또는 비-MASTER 계정 토큰) 시 {@code false} 반환.
     *
     * @param jws 파싱된 JWS
     * @return 시스템 마스터 그룹 멤버십 여부 (기본값 false)
     */
    public static boolean getIsSystemMaster(Jws<Claims> jws) {
        Boolean val = jws.getPayload().get(CLAIM_IS_SYSTEM_MASTER, Boolean.class);
        return Boolean.TRUE.equals(val);
    }

    /**
     * groups claim 추출 — Phase C5-1 신규.
     *
     * <p>api-gateway 에서 {@code X-User-Groups} 헤더 전파에 사용.
     * claim 미포함(구버전 토큰 또는 그룹 미배속 계정 토큰) 시 빈 문자열 반환 — null 안전.
     *
     * @param jws 파싱된 JWS
     * @return 활성 그룹 UUID comma-join 문자열 (없으면 빈 문자열 — null 미반환)
     */
    public static String getGroups(Jws<Claims> jws) {
        String val = jws.getPayload().get(CLAIM_GROUPS, String.class);
        return val != null ? val : "";
    }
}
