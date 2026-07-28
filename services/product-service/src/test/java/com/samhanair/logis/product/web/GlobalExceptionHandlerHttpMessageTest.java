package com.samhanair.logis.product.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.service.ProductService;
import java.sql.SQLException;
import java.time.LocalDate;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** product-service JSON body 파싱 실패 응답 계약 테스트. */
class GlobalExceptionHandlerHttpMessageTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new ProductController(mock(ProductService.class)))
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    /** 실제 제품 생성 POST 의 깨진 JSON body 는 400 INVALID_INPUT 으로 고정한다. */
    @Test
    void malformedJsonBody_returnsInvalidInput() throws Exception {
        mockMvc.perform(post("/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("요청 본문이 유효하지 않습니다"));
    }

    @Test
    void missingRequestParameter_returnsNeutralKoreanMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<ApiResponse<Void>> response = handler.handleMissingRequestParameter(
                new MissingServletRequestParameterException("category", "EstimateCategory"));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage())
                .isEqualTo("필수 요청 파라미터가 누락되었습니다.")
                .doesNotContain("category")
                .doesNotContain("EstimateCategory");
    }

    /**
     * 🚨 2026-07-28 범위 축소 — V24 quantity_sync deferred constraint trigger 자체가
     * 제거되어(PR #958 R5 재수렴 이후 개발책임자 결정, DB 강제층을 #896 슬3으로 이관)
     * {@code QuantitySyncViolationTranslator}가 함께 삭제됐다. 이 핸들러는 이제 quantity_sync
     * 네임스페이스 유무와 무관하게 모든 {@link DataIntegrityViolationException}에 항상 같은
     * 범용 409를 낸다 — 아래 테스트가 그 유일한 동작을 고정한다(과거 이 위치에 있던
     * quantitySyncTriggerViolation_translatesToSpecificKoreanMessage는 존재하지 않는 번역
     * 분기를 검증하던 테스트라 함께 제거했다).
     */
    @Test
    void unrelatedDataIntegrityViolation_keepsExistingGenericConflictMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        SQLException sqlEx = new SQLException(
                "ERROR: duplicate key value violates unique constraint "
                        + "\"ux_component_bundle_product_id_component_product_code_active\"", "23505");
        ConstraintViolationException hibernateEx = new ConstraintViolationException(
                "could not execute statement", sqlEx, "ux_component_bundle_product_id_component_product_code_active");
        DataIntegrityViolationException ex = new DataIntegrityViolationException(
                "could not execute statement", hibernateEx);

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(ex);

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.CONFLICT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage()).isEqualTo("동시 편집 충돌 또는 제약 위반");
    }

    @Test
    void typeMismatchParameter_returnsNeutralKoreanMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
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
}
