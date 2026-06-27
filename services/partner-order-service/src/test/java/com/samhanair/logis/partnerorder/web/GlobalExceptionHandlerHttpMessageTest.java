package com.samhanair.logis.partnerorder.web;

import static org.mockito.Mockito.mock;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.editrequest.service.PartnerOrderEditRequestService;
import com.samhanair.logis.partnerorder.editrequest.web.PartnerOrderEditRequestController;
import com.samhanair.logis.partnerorder.repository.FrontEventLogRepository;
import com.samhanair.logis.partnerorder.service.PartnerOrderHistoryService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** partner-order-service JSON body 파싱 실패 응답 계약 테스트. */
class GlobalExceptionHandlerHttpMessageTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(
                    new FrontEventLogController(mock(FrontEventLogRepository.class)),
                    new PartnerOrderEditRequestController(mock(PartnerOrderEditRequestService.class)),
                    new PartnerOrderHistoryController(mock(PartnerOrderHistoryService.class)))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    /** 실제 프론트 액션 로그 POST 의 깨진 JSON body 는 400 INVALID_INPUT 으로 고정한다. */
    @Test
    void malformedJsonBody_returnsInvalidInput() throws Exception {
        mockMvc.perform(post("/api/v1/partner-orders/log")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 본문이 유효하지 않습니다"));
    }

    /** 필수 query parameter 누락은 400 INVALID_INPUT 고정 메시지로 감싼다. */
    @Test
    void missingRequestParameter_returnsInvalidInputWithoutRawParameterName() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders/history"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("필수 요청 파라미터가 누락되었습니다."))
                .andExpect(content().string(not(containsString("bizCode"))))
                .andExpect(content().string(not(containsString("MissingServletRequestParameterException"))));
    }

    /** 잘못된 enum query parameter 는 enum FQN / raw 파라미터명 없이 400 으로 응답한다. */
    @Test
    void typeMismatchParameter_returnsInvalidInputWithoutEnumDetails() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders/edit-requests").param("targetRole", "NOT_A_ROLE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 파라미터 형식이 올바르지 않습니다."))
                .andExpect(content().string(not(containsString("EditTargetRole"))))
                .andExpect(content().string(not(containsString("targetRole"))))
                .andExpect(content().string(not(containsString("MethodArgumentTypeMismatchException"))));
    }
}
