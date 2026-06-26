package com.samhanair.logis.arologis.exception;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.controller.ArologisAuthController;
import com.samhanair.logis.arologis.service.auth.AdminLoginService;
import com.samhanair.logis.arologis.service.auth.AuthIdentityService;
import com.samhanair.logis.arologis.service.auth.DriverLoginService;
import com.samhanair.logis.arologis.service.auth.RefreshTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** arologis-service JSON body 파싱 실패 응답 계약 테스트. */
class ArologisExceptionHandlerHttpMessageTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new ArologisAuthController(
                    mock(AdminLoginService.class),
                    mock(DriverLoginService.class),
                    mock(RefreshTokenService.class),
                    mock(AuthIdentityService.class)))
            .setControllerAdvice(new ArologisExceptionHandler())
            .build();

    /** 실제 관리자 로그인 POST 의 깨진 JSON body 는 400 INVALID_INPUT 으로 고정한다. */
    @Test
    void malformedJsonBody_returnsInvalidInput() throws Exception {
        mockMvc.perform(post("/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 본문이 유효하지 않습니다"));
    }
}
