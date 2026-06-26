package com.samhanair.logis.dashboard.exception;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.dashboard.controller.AppReleaseController;
import com.samhanair.logis.dashboard.service.AppReleaseService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** dashboard-service JSON body 파싱 실패 응답 계약 테스트. */
class DashboardExceptionHandlerHttpMessageTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new AppReleaseController(mock(AppReleaseService.class)))
            .setControllerAdvice(new DashboardExceptionHandler())
            .build();

    /** 실제 앱 릴리스 생성 POST 의 깨진 JSON body 는 400 INVALID_INPUT 으로 고정한다. */
    @Test
    void malformedJsonBody_returnsInvalidInput() throws Exception {
        mockMvc.perform(post("/app/releases")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 본문이 유효하지 않습니다"));
    }
}
