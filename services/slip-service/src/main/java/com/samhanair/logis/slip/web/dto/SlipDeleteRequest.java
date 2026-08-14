package com.samhanair.logis.slip.web.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

/**
 * 입고 전표 soft delete 요청 DTO — SP-08-5-3.
 *
 * <p>{@code updatedAt} 은 낙관적 잠금 검증에 사용된다. 클라이언트는 상세 조회
 * 응답의 {@code updatedAt} 값을 그대로 전송해야 한다. 서버에서 마이크로초
 * truncation 비교를 수행하므로 나노초 오탐이 없다.
 *
 * @param updatedAt 클라이언트가 최종 조회한 전표의 수정 시각 (필수)
 */
public record SlipDeleteRequest(
        @NotNull(message = "updatedAt 은 필수입니다.") LocalDateTime updatedAt
) {
}
