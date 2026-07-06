package com.samhanair.logis.partner.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.controller.PartnerBlockAdminController;
import com.samhanair.logis.partner.service.PartnerBlockImportService;
import com.samhanair.logis.partner.service.PartnerBlockService;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** partner-service JSON body 파싱 실패 응답 계약 테스트. */
class PartnerExceptionHandlerHttpMessageTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new PartnerBlockAdminController(
                    mock(PartnerBlockService.class),
                    mock(PartnerBlockImportService.class)))
            .setControllerAdvice(new PartnerExceptionHandler())
            .build();

    /** 실제 BLOCK 등록 POST 의 깨진 JSON body 는 400 INVALID_INPUT 으로 고정한다. */
    @Test
    void malformedJsonBody_returnsInvalidInput() throws Exception {
        mockMvc.perform(post("/api/v1/partners/admin/blocks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 본문이 유효하지 않습니다"));
    }

    @Test
    void missingRequestParameter_returnsNeutralKoreanMessage() {
        PartnerExceptionHandler handler = new PartnerExceptionHandler();

        ResponseEntity<ApiResponse<Void>> response = handler.handleMissingRequestParameter(
                new MissingServletRequestParameterException("name", "String"));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage())
                .isEqualTo("필수 요청 파라미터가 누락되었습니다.")
                .doesNotContain("name")
                .doesNotContain("String");
    }

    @Test
    void typeMismatchParameter_returnsNeutralKoreanMessage() {
        PartnerExceptionHandler handler = new PartnerExceptionHandler();
        MethodArgumentTypeMismatchException exception = new MethodArgumentTypeMismatchException(
                "NOT_A_DATE", LocalDate.class, "from", null,
                new IllegalArgumentException("java.time.LocalDate parse failed"));

        ResponseEntity<ApiResponse<Void>> response = handler.handleTypeMismatch(exception);

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage())
                .isEqualTo("요청 파라미터 형식이 올바르지 않습니다.")
                .doesNotContain("from")
                .doesNotContain("NOT_A_DATE")
                .doesNotContain("LocalDate");
    }

    @Test
    void partnerUniqueConstraintViolation_returnsConflict() {
        PartnerExceptionHandler handler = new PartnerExceptionHandler();
        DataIntegrityViolationException exception = new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"ux_partners_partner_code_active\"");

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrity(exception);

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.CONFLICT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(ErrorCode.CONFLICT.name());
    }
}
