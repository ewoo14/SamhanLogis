package com.samhanair.logis.auth.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.config.HeaderAuthenticationFilter;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.security.InternalTokenFilter;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.auth.web.dto.internal.CreateAccountInternalRequest;
import com.samhanair.logis.auth.web.dto.internal.UpdateDisplayNameInternalRequest;
import com.samhanair.logis.auth.web.dto.internal.UpdateRoleInternalRequest;
import com.samhanair.logis.common.security.Role;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Verifies internal-token enforcement and that the controller dispatches to the right
 * service methods. Wires the controller through MockMvc with our actual filters so the
 * 401 path is exercised end-to-end.
 */
class InternalAccountControllerTest {

    private static final String VALID_TOKEN = "test-internal-token";

    private AuthService authService;
    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        authService = Mockito.mock(AuthService.class);
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(VALID_TOKEN);
        // auth-service 호환 — application.yml 의 path-prefix=/auth/internal/ + role=INTERNAL +
        // allow-missing-token=false 와 동일한 standalone 환경 명시
        props.setPathPrefix("/auth/internal/");
        props.setRole("INTERNAL");
        props.setAllowMissingToken(false);

        mockMvc = MockMvcBuilders.standaloneSetup(new InternalAccountController(authService))
                .addFilters(new InternalTokenFilter(props), new HeaderAuthenticationFilter())
                .build();
    }

    @Test
    void create_withMissingToken_returns401AndDoesNotCallService() throws Exception {
        UUID id = UUID.randomUUID();
        // passwordChangeRequired = false (기본값)
        var body = new CreateAccountInternalRequest(id, "alice", "password123", "Alice", Role.SALES, false);

        MockHttpServletResponse response = mockMvc.perform(post("/auth/internal/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(authService, never()).registerWithId(any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    void create_withWrongToken_returns401() throws Exception {
        UUID id = UUID.randomUUID();
        var body = new CreateAccountInternalRequest(id, "alice", "password123", "Alice", Role.SALES, false);

        MockHttpServletResponse response = mockMvc.perform(post("/auth/internal/accounts")
                        .header("X-Internal-Token", "wrong")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(authService, never()).registerWithId(any(), any(), any(), any(), any(), anyBoolean());
    }

    @Test
    void create_withValidToken_invokesRegisterWithIdAndReturns201() throws Exception {
        UUID id = UUID.randomUUID();
        var body = new CreateAccountInternalRequest(id, "alice", "password123", "Alice", Role.SALES, false);
        when(authService.registerWithId(eq(id), eq("alice"), eq("password123"), eq("Alice"), eq(Role.SALES), eq(false)))
                .thenReturn(new RegisterResponse(id.toString(), "alice", "SALES"));

        MockHttpServletResponse response = mockMvc.perform(post("/auth/internal/accounts")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(201);
        ArgumentCaptor<UUID> idCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(authService).registerWithId(idCaptor.capture(), eq("alice"), eq("password123"),
                eq("Alice"), eq(Role.SALES), eq(false));
        assertThat(idCaptor.getValue()).isEqualTo(id);
    }

    @Test
    void updateRole_withValidToken_invokesService() throws Exception {
        UUID id = UUID.randomUUID();
        var body = new UpdateRoleInternalRequest(Role.MANAGER);

        MockHttpServletResponse response = mockMvc.perform(patch("/auth/internal/accounts/" + id + "/role")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(204);
        verify(authService).updateAccountRole(id, Role.MANAGER);
    }

    @Test
    void updateDisplayName_withValidToken_invokesService() throws Exception {
        UUID id = UUID.randomUUID();
        var body = new UpdateDisplayNameInternalRequest("새이름");

        MockHttpServletResponse response = mockMvc.perform(patch("/auth/internal/accounts/" + id + "/display-name")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(204);
        verify(authService).updateAccountDisplayName(id, "새이름");
    }

    @Test
    void disable_withValidToken_invokesService() throws Exception {
        UUID id = UUID.randomUUID();

        MockHttpServletResponse response = mockMvc.perform(patch("/auth/internal/accounts/" + id + "/disable")
                        .header("X-Internal-Token", VALID_TOKEN))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(204);
        verify(authService).disableAccount(eq(id), eq(InternalTokenFilter.INTERNAL_PRINCIPAL));
    }

    @Test
    void delete_withValidToken_invokesService() throws Exception {
        UUID id = UUID.randomUUID();

        MockHttpServletResponse response = mockMvc.perform(delete("/auth/internal/accounts/" + id)
                        .header("X-Internal-Token", VALID_TOKEN))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(204);
        verify(authService).deleteAccount(id);
    }

    // -------------------------------------------------------------------------
    // unlock (POST /auth/internal/accounts/{id}/unlock)
    // -------------------------------------------------------------------------

    /**
     * unlock — 유효 토큰 시 authService.unlockAccount 호출 (204 No Content).
     *
     * <p>Phase 10 P0-5 — MASTER 가 사용자 관리 화면에서 잠금 해제 호출 시 경로 검증.
     */
    @Test
    void unlock_withValidToken_invokesService() throws Exception {
        UUID id = UUID.randomUUID();

        MockHttpServletResponse response = mockMvc.perform(post("/auth/internal/accounts/" + id + "/unlock")
                        .header("X-Internal-Token", VALID_TOKEN))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(204);
        verify(authService).unlockAccount(id);
    }

    /**
     * unlock — 토큰 누락 시 401 반환 + authService 미호출.
     */
    @Test
    void unlock_withMissingToken_returns401AndDoesNotCallService() throws Exception {
        UUID id = UUID.randomUUID();

        MockHttpServletResponse response = mockMvc.perform(post("/auth/internal/accounts/" + id + "/unlock"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(authService, never()).unlockAccount(any());
    }

    private static MockHttpServletRequestBuilder post(String url) {
        return MockMvcRequestBuilders.post(url);
    }

    private static MockHttpServletRequestBuilder patch(String url) {
        return MockMvcRequestBuilders.patch(url);
    }

    private static MockHttpServletRequestBuilder delete(String url) {
        return MockMvcRequestBuilders.delete(url);
    }
}
