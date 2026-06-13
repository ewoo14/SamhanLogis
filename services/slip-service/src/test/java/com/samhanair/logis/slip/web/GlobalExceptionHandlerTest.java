package com.samhanair.logis.slip.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.dto.ApiResponse;
import jakarta.persistence.OptimisticLockException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * slip-service 전역 예외 핸들러 단위 테스트 (§7 협업 Round C P2 #2).
 *
 * <p>낙관적 락 충돌이 {@code handleUnknown}(500 + 내부 메시지 노출)으로 폴백되지 않고
 * 409 CONFLICT + 일반 한국어 메시지로 매핑되는 계약을 박제한다. 특히
 * {@code ObjectOptimisticLockingFailureException} 의 메시지에 포함되는 entity FQCN/PK 가
 * 응답 본문에 노출되지 않아야 한다.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    /**
     * Spring {@code ObjectOptimisticLockingFailureException} (flush/commit 시점
     * StaleObjectStateException wrap) → 409 + entity FQCN/PK 미노출.
     */
    @Test
    void handleOptimisticLock_objectOptimisticLockingFailure_returns409WithoutInternalMessage() {
        ObjectOptimisticLockingFailureException ex = new ObjectOptimisticLockingFailureException(
                "com.samhanair.logis.slip.domain.Slip", "11111111-2222-3333-4444-555555555555");

        ResponseEntity<ApiResponse<Void>> response = handler.handleOptimisticLock(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo("CONFLICT");
        assertThat(response.getBody().getMessage())
                .isEqualTo("동시 수정 충돌 — 다시 시도해 주세요")
                // 내부 식별자 (entity FQCN / PK) 비노출 가드
                .doesNotContain("com.samhanair.logis")
                .doesNotContain("11111111-2222-3333-4444-555555555555");
    }

    /**
     * jakarta {@code OptimisticLockException} (JPA 직발) 도 같은 핸들러로 409 매핑.
     */
    @Test
    void handleOptimisticLock_jakartaOptimisticLockException_returns409() {
        ResponseEntity<ApiResponse<Void>> response = handler.handleOptimisticLock(
                new OptimisticLockException("Row was updated or deleted by another transaction"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo("CONFLICT");
        assertThat(response.getBody().getMessage())
                .isEqualTo("동시 수정 충돌 — 다시 시도해 주세요");
    }
}
