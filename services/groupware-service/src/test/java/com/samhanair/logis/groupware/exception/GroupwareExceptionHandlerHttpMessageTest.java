package com.samhanair.logis.groupware.exception;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.groupware.controller.GroupwareApprovalTemplateController;
import com.samhanair.logis.groupware.service.ApprovalTemplateService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** groupware-service JSON body 파싱 실패 응답 계약 테스트. */
class GroupwareExceptionHandlerHttpMessageTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new GroupwareApprovalTemplateController(mock(ApprovalTemplateService.class)))
            .setControllerAdvice(new GroupwareExceptionHandler())
            .build();

    /** 실제 결재유형 템플릿 생성 POST 의 깨진 JSON body 는 400 INVALID_INPUT 으로 고정한다. */
    @Test
    void malformedJsonBody_returnsInvalidInput() throws Exception {
        mockMvc.perform(post("/admin/groupware/approval-templates")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 본문이 유효하지 않습니다"));
    }
}
