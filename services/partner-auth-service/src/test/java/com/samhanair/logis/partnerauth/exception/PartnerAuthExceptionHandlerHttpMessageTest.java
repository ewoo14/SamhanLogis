package com.samhanair.logis.partnerauth.exception;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerauth.controller.PartnerAuthController;
import com.samhanair.logis.partnerauth.service.PartnerAuthService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** partner-auth-service JSON body 파싱 실패 응답 계약 테스트. */
class PartnerAuthExceptionHandlerHttpMessageTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new PartnerAuthController(mock(PartnerAuthService.class)))
            .setControllerAdvice(new PartnerAuthExceptionHandler())
            .build();

    /**
     * 실제 거래처 로그인 POST 의 깨진 JSON body 는 400 INVALID_INPUT 으로 고정한다.
     * ubuntu-latest 불변: MockMvc와 URL 문자열만 사용해 경로 구분자·대소문자·OS API에 의존하지 않는다.
     */
    @Test
    void malformedJsonBody_returnsInvalidInput() throws Exception {
        mockMvc.perform(post("/api/v1/auth/partner-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 본문이 유효하지 않습니다"));
    }

    /**
     * JSON 전용 가입 신청에 form-urlencoded 를 보내면 현재는 500이지만 415로 알려야 한다.
     * ubuntu-latest 불변: MockMvc와 URL 문자열만 사용해 경로 구분자·대소문자·OS API에 의존하지 않는다.
     */
    @Test
    void unsupportedContentType_returnsUnsupportedMediaType() throws Exception {
        mockMvc.perform(post("/api/v1/auth/partner-register")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED_VALUE + ";charset=UTF-8")
                        .param("bizNo", "1068689215"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("지원하지 않는 Content-Type입니다"));
    }
}
