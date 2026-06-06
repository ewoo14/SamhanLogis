package com.samhanair.logis.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link JwtTokenProvider} 단위 테스트.
 *
 * <p>Phase C4: isSystemMaster claim generate/parse 검증 — 있음/없음/기존 토큰 backward compat.
 */
@DisplayName("JwtTokenProvider — claim 직렬화·역직렬화 검증")
class JwtTokenProviderTest {

    private static final byte[] SECRET =
            "samhanlogis-test-secret-key-must-be-at-least-32-bytes-long".getBytes(StandardCharsets.UTF_8);

    @Test
    @DisplayName("기존 2-arg generate: userId·role 왕복 (하위 호환)")
    void roundTripPreservesUserIdAndRole() {
        String token = JwtTokenProvider.generate("user-001", Role.SALES.name(), 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertEquals("user-001", JwtTokenProvider.getUserId(parsed));
        assertEquals("SALES", JwtTokenProvider.getRole(parsed));
    }

    @Test
    @DisplayName("기존 토큰(isSystemMaster claim 없음) — getIsSystemMaster false 반환")
    void legacyToken_isSystemMasterFalse() {
        // Phase 12 이전 방식 토큰 — isSystemMaster claim 미포함
        String token = JwtTokenProvider.generate("user-002", Role.MASTER.name(), 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isFalse();
    }

    @Test
    @DisplayName("isSystemMaster=true claim generate/parse 왕복")
    void isSystemMasterTrue_roundTrip() {
        String token = JwtTokenProvider.generate(
                "master-user", Role.MASTER.name(), null, true, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getUserId(parsed)).isEqualTo("master-user");
        assertThat(JwtTokenProvider.getRole(parsed)).isEqualTo("MASTER");
        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isTrue();
    }

    @Test
    @DisplayName("isSystemMaster=false — claim 미포함, getIsSystemMaster false 반환")
    void isSystemMasterFalse_claimAbsent() {
        String token = JwtTokenProvider.generate(
                "normal-user", Role.MANAGER.name(), null, false, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isFalse();
        // isSystemMaster claim 자체가 없어야 함 (불필요한 payload 증가 방지)
        assertThat(parsed.getPayload().containsKey(JwtTokenProvider.CLAIM_IS_SYSTEM_MASTER)).isFalse();
    }

    @Test
    @DisplayName("departmentName + isSystemMaster 동시 포함 토큰 왕복")
    void departmentAndSystemMaster_roundTrip() {
        String token = JwtTokenProvider.generate(
                "master-2", Role.MASTER.name(), "대표실", true, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getDepartmentName(parsed)).isEqualTo("대표실");
        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isTrue();
        assertThat(JwtTokenProvider.getRole(parsed)).isEqualTo("MASTER");
    }
}
