package com.samhanair.logis.auth.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.config.HeaderAuthenticationFilter;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.dto.LoginResponse;
import com.samhanair.logis.auth.web.dto.MeResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * 모바일 슬1 쿠키 인증 계약 검증.
 *
 * <p>MockMvc standalone 으로 controller 계약만 검증한다. 한글 응답은 반드시 UTF-8 로 디코딩한다.
 */
class AuthControllerCookieIT {

    private AuthService authService;
    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        authService = Mockito.mock(AuthService.class);
        AuthController controller = new AuthController(authService);
        ReflectionTestUtils.setField(controller, "cookieSecure", false);
        ReflectionTestUtils.setField(controller, "jwtTtlSeconds", 3600L);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .addFilters(new HeaderAuthenticationFilter())
                .build();
    }

    @Test
    @DisplayName("POST /auth/login 은 body token 을 유지하면서 access_token HttpOnly 쿠키를 발급한다")
    void login_setsAccessTokenCookieAndKeepsBodyToken() throws Exception {
        LoginResponse.GroupSummary group =
                new LoginResponse.GroupSummary("g-1", "관리자", true);
        when(authService.login("dev_master", "Pass1234!"))
                .thenReturn(new LoginResponse(
                        "jwt-token", UUID.randomUUID().toString(), "MASTER",
                        "개발책임자", null, List.of(group)));

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"loginId":"dev_master","password":"Pass1234!"}
                                        """))
                .andReturn()
                .getResponse();

        String body = response.getContentAsString(StandardCharsets.UTF_8);
        String setCookie = response.getHeader(HttpHeaders.SET_COOKIE);
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(body).contains("\"token\":\"jwt-token\"");
        assertThat(body).contains("\"partnerCode\":null");
        assertThat(body).contains("\"groups\":[");
        assertThat(setCookie).contains("access_token=jwt-token");
        assertThat(setCookie).contains("HttpOnly");
        assertThat(setCookie).contains("SameSite=Lax");
        assertThat(setCookie).contains("Path=/");
        assertThat(setCookie).contains("Max-Age=3600");
    }

    @Test
    @DisplayName("POST /auth/logout 은 access_token 쿠키를 만료한다")
    void logout_expiresAccessTokenCookie() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.post("/auth/logout"))
                .andReturn()
                .getResponse();

        String setCookie = response.getHeader(HttpHeaders.SET_COOKIE);
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(setCookie).contains("access_token=");
        assertThat(setCookie).contains("Max-Age=0");
        assertThat(setCookie).contains("Path=/");
    }

    @Test
    @DisplayName("GET /auth/me 는 로그인 응답과 동일하게 partnerCode 와 groups 를 반환한다")
    void me_returnsPartnerCodeAndGroupsForWebBootstrap() throws Exception {
        String userId = UUID.randomUUID().toString();
        when(authService.getMeResponse(UUID.fromString(userId)))
                .thenReturn(new MeResponse(
                        userId, "dev_master", "MASTER", "개발책임자",
                        null, List.of(new LoginResponse.GroupSummary("g-1", "관리자", true))));

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.get("/auth/me")
                                .header("X-User-Id", userId))
                .andReturn()
                .getResponse();

        String body = response.getContentAsString(StandardCharsets.UTF_8);
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(body).contains("\"partnerCode\":null");
        assertThat(body).contains("\"groups\":[");
        assertThat(body).contains("개발책임자");
    }

    @Test
    @DisplayName("GET /auth/me 는 X-User-Id 가 없으면 UNAUTHORIZED")
    void me_withoutUserHeader_throwsUnauthorized() {
        BusinessException cause = performAndExpectBusinessException(
                MockMvcRequestBuilders.get("/auth/me"));

        assertThat(cause.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    @Test
    @DisplayName("GET /auth/me 는 X-User-Id 가 UUID 가 아니면 UNAUTHORIZED")
    void me_withInvalidUserHeader_throwsUnauthorized() {
        BusinessException cause = performAndExpectBusinessException(
                MockMvcRequestBuilders.get("/auth/me")
                        .header("X-User-Id", "not-a-uuid"));

        assertThat(cause.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    /**
     * standalone MockMvc 는 전역 예외 핸들러 없이 controller 예외를 ServletException 으로 감싼다.
     * 원인 체인에서 BusinessException 을 찾아 controller 계약을 검증한다.
     */
    private BusinessException performAndExpectBusinessException(RequestBuilder requestBuilder) {
        try {
            mockMvc.perform(requestBuilder).andReturn();
            throw new AssertionError("expected BusinessException to be thrown");
        } catch (Exception ex) {
            Throwable cursor = ex;
            while (cursor != null && !(cursor instanceof BusinessException)) {
                cursor = cursor.getCause();
            }
            assertThat(cursor).as("expected BusinessException in cause chain").isInstanceOf(BusinessException.class);
            return (BusinessException) cursor;
        }
    }
}
