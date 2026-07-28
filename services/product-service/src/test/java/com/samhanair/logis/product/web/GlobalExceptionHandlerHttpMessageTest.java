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
     * 재수렴 R4 결함 A [HIGH] GREEN — V24 quantity_sync deferred trigger가 던진
     * {@link DataIntegrityViolationException}은 원인이 드러나는 한국어 메시지로 번역된다.
     * commit 시점 실측 원문 형태({@code "Hibernate transaction: Unable to commit against
     * JDBC Connection; ERROR: quantity_sync ..."})를 그대로 재현한다(실측:
     * QuantitySyncRuleExposureChangeMaskedConflictHttpIT/
     * QuantitySyncRuleSheetSyncCascadeIT 실행 로그).
     */
    @Test
    void quantitySyncTriggerViolation_translatesToSpecificKoreanMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        SQLException sqlEx = new SQLException(
                "ERROR: quantity_sync source and target must stay inside rule category\n"
                        + "  Where: PL/pgSQL function quantity_sync_validate_rule_graph() line 74 at RAISE",
                "23514");
        DataIntegrityViolationException ex = new DataIntegrityViolationException(
                "Hibernate transaction: Unable to commit against JDBC Connection; "
                        + "ERROR: quantity_sync source and target must stay inside rule category",
                sqlEx);

        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(ex);

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.CONFLICT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage())
                .isEqualTo("수량 동기화 규칙이 참조하는 품목의 노출 카테고리가 바뀌어 규칙 제약을 벗어났습니다.")
                .doesNotContain("동시 편집 충돌 또는 제약 위반");
    }

    /**
     * 재수렴 R4 결함 A U-4.3 회귀 방지 lock — quantity_sync 트리거와 무관한
     * {@link DataIntegrityViolationException}(예: 구성품 replace-all의 동시 PUT 경합으로
     * 인한 부분 유니크 인덱스 위반)은 fix 이후에도 기존 범용 409 메시지를 그대로 유지한다.
     * 번역기가 quantity_sync 네임스페이스(V24 RAISE EXCEPTION 접두어)가 없는 예외까지
     * 건드리면 안 된다.
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
