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
 */
public final class JwtTokenProvider {

    /** JWT claim key — 부서명 (한국어 문자열, 예: "대표실"). */
    public static final String CLAIM_DEPARTMENT_NAME = "departmentName";

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
     * departmentName claim 포함 발급 메서드.
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
        SecretKey key = Keys.hmacShaKeyFor(secret);
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(userId)
                .claim("role", role)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key, Jwts.SIG.HS256);
        if (departmentName != null && !departmentName.isBlank()) {
            builder.claim(CLAIM_DEPARTMENT_NAME, departmentName);
        }
        return builder.compact();
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
     * @param jws 파싱된 JWS
     * @return 역할 문자열 (예: "MASTER")
     */
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
}
