package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * PartnerSelfScopeGuard 단위 테스트 — Phase C5-4 P0.
 *
 * <p>PARTNER 식별이 SecurityContext ROLE_PARTNER authority 가 아니라
 * {@code X-Is-Partner} 헤더 기반으로 동작하는지 검증한다.
 *
 * <ul>
 *   <li>X-Is-Partner 헤더 없음 → isPartnerAuthority()=false → 자기범위 검증 skip(내부 role 취급)</li>
 *   <li>X-Is-Partner=true → isPartnerAuthority()=true → 자기범위 강제 검증</li>
 *   <li>X-Is-Partner=false → isPartnerAuthority()=false</li>
 *   <li>assertOwnPartner: PARTNER 호출에서 partnerCode 불일치 시 AccessDeniedException</li>
 *   <li>assertOwnPartner: PARTNER 호출에서 partnerCode 일치 시 통과</li>
 *   <li>assertOwnPartner: 비-PARTNER 호출(X-Is-Partner 없음) 시 partnerCode 무관 통과</li>
 * </ul>
 */
class PartnerSelfScopeGuardTest {

    private PartnerSelfScopeGuard guard;
    private MockHttpServletRequest mockRequest;

    @BeforeEach
    void setUp() {
        guard = new PartnerSelfScopeGuard();
        mockRequest = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(mockRequest));
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
    }

    // -------------------------------------------------------------------------
    // isPartnerAuthority() 판정
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("X-Is-Partner 헤더 없으면 isPartnerAuthority=false (내부 role 취급)")
    void isPartnerAuthority_whenHeaderAbsent_returnsFalse() {
        // X-Is-Partner 헤더 미주입
        assertThat(guard.isPartnerAuthority()).isFalse();
    }

    @Test
    @DisplayName("X-Is-Partner=true 이면 isPartnerAuthority=true")
    void isPartnerAuthority_whenHeaderTrue_returnsTrue() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "true");
        assertThat(guard.isPartnerAuthority()).isTrue();
    }

    @Test
    @DisplayName("X-Is-Partner=false 이면 isPartnerAuthority=false")
    void isPartnerAuthority_whenHeaderFalse_returnsFalse() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "false");
        assertThat(guard.isPartnerAuthority()).isFalse();
    }

    @Test
    @DisplayName("X-Is-Partner 대소문자 무시 — TRUE 도 true 로 인식")
    void isPartnerAuthority_caseInsensitive_returnsTrue() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "TRUE");
        assertThat(guard.isPartnerAuthority()).isTrue();
    }

    // -------------------------------------------------------------------------
    // assertOwnPartner() — 자기범위 검증
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("비-PARTNER(X-Is-Partner 없음): assertOwnPartner → partnerCode 무관 통과")
    void assertOwnPartner_nonPartner_alwaysPasses() {
        // X-Is-Partner 헤더 없음 → 내부 role 취급 → 자기범위 검증 skip
        guard.assertOwnPartner("OTHER-001", "P001", "테스트 거부");
        // 예외 없이 통과해야 함
    }

    @Test
    @DisplayName("PARTNER(X-Is-Partner=true): assertOwnPartner → 본인 거래처 코드 일치 시 통과")
    void assertOwnPartner_partnerWithMatchingCode_passes() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "true");
        guard.assertOwnPartner("P001", "P001", "타 거래처 접근 거부");
        // 예외 없이 통과해야 함
    }

    @Test
    @DisplayName("PARTNER(X-Is-Partner=true): assertOwnPartner → 타 거래처 코드 불일치 시 AccessDeniedException")
    void assertOwnPartner_partnerWithMismatchedCode_throwsAccessDenied() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "true");
        assertThatThrownBy(() -> guard.assertOwnPartner("OTHER-001", "P001", "타 거래처 접근 거부"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessage("타 거래처 접근 거부");
    }

    @Test
    @DisplayName("PARTNER(X-Is-Partner=true): callerPartnerCode null 이면 AccessDeniedException")
    void assertOwnPartner_partnerWithNullCallerCode_throwsAccessDenied() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "true");
        assertThatThrownBy(() -> guard.assertOwnPartner("P001", null, "메시지"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("partnerCode");
    }

    // -------------------------------------------------------------------------
    // partnerScopeOrNull() — 범위 코드 반환
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("비-PARTNER: partnerScopeOrNull → null (전체 범위 허용)")
    void partnerScopeOrNull_nonPartner_returnsNull() {
        String scope = guard.partnerScopeOrNull("P001");
        assertThat(scope).isNull();
    }

    @Test
    @DisplayName("PARTNER(X-Is-Partner=true): partnerScopeOrNull → callerPartnerCode 반환")
    void partnerScopeOrNull_partner_returnsCallerCode() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "true");
        String scope = guard.partnerScopeOrNull("P001");
        assertThat(scope).isEqualTo("P001");
    }

    // -------------------------------------------------------------------------
    // restrictRequestedPartnerCode() — 요청 필터 범위 제한
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("PARTNER: requestedPartnerCode 가 본인 코드와 다르면 AccessDeniedException")
    void restrictRequestedPartnerCode_partnerMismatch_throwsAccessDenied() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "true");
        assertThatThrownBy(() -> guard.restrictRequestedPartnerCode("OTHER-001", "P001"))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("PARTNER: requestedPartnerCode 가 null 이면 본인 코드 반환 (자기범위 적용)")
    void restrictRequestedPartnerCode_partnerWithNullRequested_returnsOwnCode() {
        mockRequest.addHeader(HttpHeaderConstants.IS_PARTNER_HEADER, "true");
        String result = guard.restrictRequestedPartnerCode(null, "P001");
        assertThat(result).isEqualTo("P001");
    }

    @Test
    @DisplayName("비-PARTNER: requestedPartnerCode 그대로 반환 (범위 제한 없음)")
    void restrictRequestedPartnerCode_nonPartner_returnsRequestedCode() {
        String result = guard.restrictRequestedPartnerCode("ANY-001", "P001");
        assertThat(result).isEqualTo("ANY-001");
    }
}
