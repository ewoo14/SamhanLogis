package com.samhanair.logis.auth.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.service.PasswordResetRateLimiter;
import com.samhanair.logis.auth.service.PasswordResetTokenService;
import com.samhanair.logis.auth.web.dto.PasswordResetConfirmDto;
import com.samhanair.logis.auth.web.dto.PasswordResetRequestDto;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * P0-2 비밀번호 셀프 재설정 — {@link PasswordResetController} standalone 단위 테스트.
 *
 * <p>200 / 400 (입력 검증 실패) / 429 (rate-limit) 시나리오 검증.
 * SecurityConfig 는 standalone setup 에서 비활성 — permitAll 검증은 IT 에서 별도.
 */
class PasswordResetControllerTest {

    private PasswordResetTokenService tokenService;
    private PasswordResetRateLimiter rateLimiter;
    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        tokenService = Mockito.mock(PasswordResetTokenService.class);
        rateLimiter = Mockito.mock(PasswordResetRateLimiter.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new PasswordResetController(tokenService, rateLimiter))
                .build();
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/request — 200 OK
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — 유효한 요청은 200 OK + 성공 메시지 반환")
    void requestReset_valid_returns200() throws Exception {
        var body = new PasswordResetRequestDto("alice", "alice@samhan.com");

        MockHttpServletResponse response = mockMvc.perform(
                MockMvcRequestBuilders.post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        String responseBody = new String(response.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(responseBody).contains("인증번호가 등록된 이메일로 전송되었습니다");

        verify(rateLimiter).checkAndIncrement(eq("alice"), anyString());
        verify(tokenService).requestReset(eq("alice"), eq("alice@samhan.com"), anyString());
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/request — 400 이메일 형식 오류
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — 이메일 형식 오류 시 400 Bad Request")
    void requestReset_invalidEmail_returns400() throws Exception {
        String json = "{\"loginId\":\"alice\",\"email\":\"not-an-email\"}";

        MockHttpServletResponse response = mockMvc.perform(
                MockMvcRequestBuilders.post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        verify(tokenService, never()).requestReset(anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/request — 400 loginId 누락
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — loginId 누락 시 400 Bad Request")
    void requestReset_missingLoginId_returns400() throws Exception {
        String json = "{\"email\":\"alice@samhan.com\"}";

        MockHttpServletResponse response = mockMvc.perform(
                MockMvcRequestBuilders.post("/auth/password-reset/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        verify(tokenService, never()).requestReset(anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/request — 429 rate-limit
    // ---------------------------------------------------------------

    @Test
    @DisplayName("requestReset — rate-limit 초과 시 서비스가 BusinessException 던지고 전파")
    void requestReset_rateLimitExceeded_propagatesException() throws Exception {
        doThrow(new BusinessException(ErrorCode.INVALID_INPUT, "요청이 너무 많습니다"))
                .when(rateLimiter).checkAndIncrement(anyString(), anyString());

        var body = new PasswordResetRequestDto("alice", "alice@samhan.com");

        // standalone MockMvc — GlobalExceptionHandler 없음, exception 이 ServletException 으로 wrap
        try {
            mockMvc.perform(
                    MockMvcRequestBuilders.post("/auth/password-reset/request")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andReturn();
        } catch (Exception ex) {
            Throwable cursor = ex;
            while (cursor != null && !(cursor instanceof BusinessException)) {
                cursor = cursor.getCause();
            }
            assertThat(cursor).isInstanceOf(BusinessException.class);
            assertThat(((BusinessException) cursor).getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
        }

        verify(tokenService, never()).requestReset(anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/confirm — 200 OK
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 유효한 인증번호 + 비밀번호로 200 OK")
    void confirmReset_valid_returns200() throws Exception {
        var body = new PasswordResetConfirmDto("alice", "123456", "NewPass1!", "NewPass1!");

        MockHttpServletResponse response = mockMvc.perform(
                MockMvcRequestBuilders.post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        String responseBody = new String(response.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(responseBody).contains("비밀번호가 재설정되었습니다");

        verify(tokenService).confirmReset("alice", "123456", "NewPass1!", "NewPass1!");
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/confirm — 400 token 길이 오류
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 6자리 미만 token 시 400 Bad Request")
    void confirmReset_shortToken_returns400() throws Exception {
        String json = "{\"loginId\":\"alice\",\"token\":\"123\",\"newPassword\":\"NewPass1!\",\"confirmPassword\":\"NewPass1!\"}";

        MockHttpServletResponse response = mockMvc.perform(
                MockMvcRequestBuilders.post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        verify(tokenService, never()).confirmReset(anyString(), anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/confirm — 400 비밀번호 짧음
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 8자 미만 비밀번호 시 400 Bad Request")
    void confirmReset_shortPassword_returns400() throws Exception {
        String json = "{\"loginId\":\"alice\",\"token\":\"123456\",\"newPassword\":\"Np1!\",\"confirmPassword\":\"Np1!\"}";

        MockHttpServletResponse response = mockMvc.perform(
                MockMvcRequestBuilders.post("/auth/password-reset/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        verify(tokenService, never()).confirmReset(anyString(), anyString(), anyString(), anyString());
    }

    // ---------------------------------------------------------------
    // POST /auth/password-reset/confirm — UNAUTHORIZED 전파
    // ---------------------------------------------------------------

    @Test
    @DisplayName("confirmReset — 만료/사용된 토큰 시 서비스 UNAUTHORIZED 예외 전파")
    void confirmReset_expiredToken_propagatesUnauthorized() throws Exception {
        doThrow(new BusinessException(ErrorCode.UNAUTHORIZED, "인증번호가 만료되었습니다"))
                .when(tokenService).confirmReset(anyString(), anyString(), anyString(), anyString());

        var body = new PasswordResetConfirmDto("alice", "123456", "NewPass1!", "NewPass1!");

        try {
            mockMvc.perform(
                    MockMvcRequestBuilders.post("/auth/password-reset/confirm")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andReturn();
        } catch (Exception ex) {
            Throwable cursor = ex;
            while (cursor != null && !(cursor instanceof BusinessException)) {
                cursor = cursor.getCause();
            }
            assertThat(cursor).isInstanceOf(BusinessException.class);
            assertThat(((BusinessException) cursor).getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
        }
    }
}
