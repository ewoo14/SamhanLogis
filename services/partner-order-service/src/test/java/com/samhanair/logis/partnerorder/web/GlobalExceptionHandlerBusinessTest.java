package com.samhanair.logis.partnerorder.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/** 가격 계산 장애가 500/침묵이 아닌 읽을 수 있는 503으로 표면화되는 계약 테스트. */
class GlobalExceptionHandlerBusinessTest {

    @Test
    void priceCalculationUnavailable_returnsReadableServiceUnavailableResponse() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<ApiResponse<Void>> response = handler.handleBusiness(
                new BusinessException(ErrorCode.PRICE_CALCULATION_UNAVAILABLE,
                        ErrorCode.PRICE_CALCULATION_UNAVAILABLE.getDefaultMessage()));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.PRICE_CALCULATION_UNAVAILABLE.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo("PRICE_CALCULATION_UNAVAILABLE");
        assertThat(response.getBody().getMessage())
                .contains("가격 계산 서버")
                .contains("주문을 확정할 수 없습니다")
                .doesNotContain("스택");
    }
}
