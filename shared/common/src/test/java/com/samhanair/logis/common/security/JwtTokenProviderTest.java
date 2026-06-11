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
 * <p>Phase C5-1: groups claim generate/parse 검증 — 있음/없음/구토큰 backward compat.
 * <p>Phase C5-4: role 클레임 제거 검증 — generate 후 role claim 미포함 확인.
 *                generateForPartner 신규 메서드 검증 (partnerCode claim 포함).
 */
@DisplayName("JwtTokenProvider — claim 직렬화·역직렬화 검증")
@SuppressWarnings("deprecation")
class JwtTokenProviderTest {

    private static final byte[] SECRET =
            "samhanlogis-test-secret-key-must-be-at-least-32-bytes-long".getBytes(StandardCharsets.UTF_8);

    @Test
    @DisplayName("Phase C5-4: generate() — role claim 미포함 확인 (인가 경로 role 소멸)")
    void generate_doesNotContainRoleClaim() {
        String token = JwtTokenProvider.generate("user-001", Role.SALES.name(), 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertEquals("user-001", JwtTokenProvider.getUserId(parsed));
        // C5-4: role 클레임이 JWT 에서 제거됨 — null 반환
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
        assertThat(parsed.getPayload().containsKey("role")).isFalse();
    }

    @Test
    @DisplayName("기존 토큰(isSystemMaster claim 없음) — getIsSystemMaster false 반환")
    void legacyToken_isSystemMasterFalse() {
        String token = JwtTokenProvider.generate("user-002", Role.MASTER.name(), 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isFalse();
    }

    @Test
    @DisplayName("C5-4: isSystemMaster=true claim generate/parse 왕복 — role claim 없음")
    void isSystemMasterTrue_roundTrip_noRoleClaim() {
        String token = JwtTokenProvider.generate(
                "master-user", Role.MASTER.name(), null, true, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getUserId(parsed)).isEqualTo("master-user");
        // C5-4: role 클레임 미포함
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
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
    @DisplayName("C5-4: departmentName + isSystemMaster 동시 포함 토큰 왕복 — role 없음")
    void departmentAndSystemMaster_roundTrip_noRoleClaim() {
        String token = JwtTokenProvider.generate(
                "master-2", Role.MASTER.name(), "대표실", true, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getDepartmentName(parsed)).isEqualTo("대표실");
        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isTrue();
        // C5-4: role 클레임 미포함
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
    }

    @Test
    @DisplayName("displayName claim(name) 포함 토큰 왕복 — departmentName 패턴과 동일하게 blank 제외")
    void displayName_roundTrip_noRoleClaim() {
        String token = JwtTokenProvider.generate(
                "display-user", Role.MANAGER.name(), "배차팀", "홍길동", false, "grp-1", 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getDepartmentName(parsed)).isEqualTo("배차팀");
        assertThat(JwtTokenProvider.getDisplayName(parsed)).isEqualTo("홍길동");
        assertThat(parsed.getPayload().get(JwtTokenProvider.CLAIM_DISPLAY_NAME, String.class))
                .isEqualTo("홍길동");
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
    }

    // ── Phase C5-1 groups claim 검증 ──────────────────────────────────────────

    @Test
    @DisplayName("C5-1+C5-4: groups claim 포함 7-arg generate/parse 왕복 — role 없음")
    void groups_generate_roundTrip_noRoleClaim() {
        String groupsJoined = "g-uuid-1,g-uuid-2,g-uuid-3";
        String token = JwtTokenProvider.generate(
                "user-g1", Role.MANAGER.name(), null, false, groupsJoined, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getGroups(parsed)).isEqualTo(groupsJoined);
        // C5-4: role claim 없음
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isFalse();
    }

    @Test
    @DisplayName("C5-1: groups 빈 문자열 → claim 미포함, getGroups 빈 문자열 반환")
    void groups_empty_claimAbsent() {
        String token = JwtTokenProvider.generate(
                "user-ng", Role.SALES.name(), null, false, "", 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(parsed.getPayload().containsKey(JwtTokenProvider.CLAIM_GROUPS)).isFalse();
        assertThat(JwtTokenProvider.getGroups(parsed)).isEqualTo("");
    }

    @Test
    @DisplayName("C5-1: 구토큰(6-arg, groups claim 없음) — getGroups 빈 문자열 반환 (backward compat)")
    void legacyToken_groupsClaimAbsent_returnsEmpty() {
        String token = JwtTokenProvider.generate(
                "legacy-u", Role.DRIVER.name(), null, false, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getGroups(parsed)).isEqualTo("");
        assertThat(parsed.getPayload().containsKey(JwtTokenProvider.CLAIM_GROUPS)).isFalse();
    }

    @Test
    @DisplayName("C5-1+C5-4: groups + departmentName + isSystemMaster 동시 포함 토큰 왕복 — role 없음")
    void allClaims_roundTrip_noRoleClaim() {
        String groups = "grp-aaa,grp-bbb";
        String token = JwtTokenProvider.generate(
                "master-full", Role.MASTER.name(), "대표실", true, groups, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getUserId(parsed)).isEqualTo("master-full");
        // C5-4: role claim 없음
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
        assertThat(JwtTokenProvider.getDepartmentName(parsed)).isEqualTo("대표실");
        assertThat(JwtTokenProvider.getIsSystemMaster(parsed)).isTrue();
        assertThat(JwtTokenProvider.getGroups(parsed)).isEqualTo(groups);
    }

    // ── Phase C5-4 generateForPartner 검증 ──────────────────────────────────

    @Test
    @DisplayName("C5-4: generateForPartner — partnerCode claim 포함, role 없음")
    void generateForPartner_containsPartnerCodeClaim_noRoleClaim() {
        String token = JwtTokenProvider.generateForPartner(
                "partner-001-uuid", "P001", 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getUserId(parsed)).isEqualTo("partner-001-uuid");
        assertThat(JwtTokenProvider.getPartnerCode(parsed)).isEqualTo("P001");
        // role claim 없음
        assertThat(JwtTokenProvider.getRole(parsed)).isNull();
        assertThat(parsed.getPayload().containsKey("role")).isFalse();
    }

    @Test
    @DisplayName("C5-4: generateForPartner — partnerCode 없으면 claim 미포함")
    void generateForPartner_nullPartnerCode_claimAbsent() {
        String token = JwtTokenProvider.generateForPartner(
                "partner-002-uuid", null, 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getPartnerCode(parsed)).isNull();
        assertThat(parsed.getPayload().containsKey(JwtTokenProvider.CLAIM_PARTNER_CODE)).isFalse();
    }

    @Test
    @DisplayName("C5-4: Samhan JWT — getPartnerCode null 반환 (partnerCode claim 없음)")
    void samhanJwt_getPartnerCode_returnsNull() {
        String token = JwtTokenProvider.generate("samhan-user", Role.MANAGER.name(), 3600L, SECRET);

        Jws<Claims> parsed = JwtTokenProvider.parse(token, SECRET);

        assertThat(JwtTokenProvider.getPartnerCode(parsed)).isNull();
    }
}
