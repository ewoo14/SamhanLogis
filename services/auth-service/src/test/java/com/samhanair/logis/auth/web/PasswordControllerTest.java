package com.samhanair.logis.auth.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.config.HeaderAuthenticationFilter;
import com.samhanair.logis.auth.service.PasswordResetService;
import com.samhanair.logis.auth.web.dto.PasswordChangeRequest;
import com.samhanair.logis.auth.web.dto.PasswordResetConfirmRequest;
import com.samhanair.logis.auth.web.dto.PasswordResetRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * PasswordController endpoint dispatch + 입력 검증 — Phase 10 P0-2.
 *
 * <p>주: {@code @PreAuthorize} 검증은 standalone setup 에서 비활성 (PR #99 패턴 동일).
 * 권한 시나리오는 별도 IT 또는 gateway 테스트에서 검증.
 */
class PasswordControllerTest {

    private PasswordResetService service;
    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = Mockito.mock(PasswordResetService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new PasswordController(service))
                .addFilters(new HeaderAuthenticationFilter())
                .build();
    }

    // ------------------------------------------------------------------
    // GET /auth/password/policy
    // ------------------------------------------------------------------

    @Test
    void getPolicy_returnsPolicyJson() throws Exception {
        MvcResult result = mockMvc.perform(MockMvcRequestBuilders.get("/auth/password/policy"))
                .andReturn();

        MockHttpServletResponse response = result.getResponse();
        assertThat(response.getStatus()).isEqualTo(200);
        // UTF-8 로 직접 디코드 — MockHttpServletResponse 기본 charset 미설정 trap 회피
        String body = new String(response.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(body).contains(
                "\"minLength\":8",
                "\"maxLength\":32",
                "\"requireLetter\":true",
                "\"requireDigit\":true",
                "\"requireSpecial\":true",
                "\"historyReuseBlock\":5",
                "\"maxFailedLoginAttempts\":5",
                "\"resetTokenTtlMinutes\":30");
    }

    // ------------------------------------------------------------------
    // POST /auth/password/reset/request
    // ------------------------------------------------------------------

    @Test
    void requestReset_invokesService() throws Exception {
        var body = new PasswordResetRequest("alice", "alice@samhan.com");

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.post("/auth/password/reset/request")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        verify(service).requestReset("alice", "alice@samhan.com");
    }

    @Test
    void requestReset_invalidEmail_returns400() throws Exception {
        // @Email 검증 실패
        String json = "{\"loginId\":\"alice\",\"email\":\"not-an-email\"}";

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.post("/auth/password/reset/request")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(json))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        verify(service, never()).requestReset(any(), any());
    }

    // ------------------------------------------------------------------
    // POST /auth/password/reset/confirm
    // ------------------------------------------------------------------

    @Test
    void confirmReset_invokesService() throws Exception {
        var body = new PasswordResetConfirmRequest("token-abc", "NewPass1!");

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.post("/auth/password/reset/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        verify(service).confirmReset("token-abc", "NewPass1!");
    }

    // ------------------------------------------------------------------
    // POST /auth/password/change — X-User-Id 헤더 필요
    // ------------------------------------------------------------------

    @Test
    void changePassword_withUserHeader_invokesService() throws Exception {
        UUID userId = UUID.randomUUID();
        var body = new PasswordChangeRequest("OldPass1!", "NewPass1!");

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.post("/auth/password/change")
                                .header("X-User-Id", userId.toString())
                                .header("X-User-Role", "MANAGER")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        verify(service).changePassword(eq(userId), eq("OldPass1!"), eq("NewPass1!"));
    }

    @Test
    void changePassword_missingUserHeader_throwsUnauthorized() throws Exception {
        var body = new PasswordChangeRequest("OldPass1!", "NewPass1!");

        // standalone setup 미연결 — GlobalExceptionHandler 부재로 BusinessException 이
        // ServletException 으로 wrap 되어 perform 단계에서 throw. cause 로 검증.
        BusinessException cause = performAndExpectBusinessException(
                MockMvcRequestBuilders.post("/auth/password/change")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)));

        assertThat(cause.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
        verify(service, never()).changePassword(any(), any(), any());
    }

    @Test
    void changePassword_serviceThrowsUnauthorized_propagates() throws Exception {
        UUID userId = UUID.randomUUID();
        var body = new PasswordChangeRequest("OldPass1!", "NewPass1!");
        doThrow(new BusinessException(ErrorCode.UNAUTHORIZED, "기존 비밀번호가 올바르지 않습니다"))
                .when(service).changePassword(eq(userId), eq("OldPass1!"), eq("NewPass1!"));

        BusinessException cause = performAndExpectBusinessException(
                MockMvcRequestBuilders.post("/auth/password/change")
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)));

        assertThat(cause.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
    }

    /**
     * standalone MockMvc 는 controller 에서 throw 된 unhandled exception 을 ServletException
     * 으로 wrap 하여 perform 단계에서 던진다 — cause 를 풀어 BusinessException 으로 검증.
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

    // ------------------------------------------------------------------
    // PATCH /auth/admin/accounts/{id}/unlock — service dispatch 만 검증
    // ------------------------------------------------------------------

    @Test
    void unlock_invokesService() throws Exception {
        UUID id = UUID.randomUUID();

        MockHttpServletResponse response = mockMvc.perform(
                        MockMvcRequestBuilders.patch("/auth/admin/accounts/" + id + "/unlock")
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "MASTER"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(204);
        verify(service).unlockAccount(id);
    }
}
