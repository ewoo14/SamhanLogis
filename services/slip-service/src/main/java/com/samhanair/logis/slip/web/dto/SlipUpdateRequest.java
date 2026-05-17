package com.samhanair.logis.slip.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 매입 전표 direct PUT 수정 요청.
 *
 * <p>{@code updatedAt} 은 상세 조회 시점의 {@code modifiedAt} 값이며, 기존 row 에 수정일이
 * 없으면 {@code createdAt} 값으로 비교한다.
 */
public record SlipUpdateRequest(
        @NotNull LocalDateTime updatedAt,
        @Size(max = 100) String partnerName,
        @Size(max = 50) String partnerCode,
        @Size(max = 1000) String memo,
        @Size(max = 50) String businessNumber,
        @Size(max = 500) String deliveryAddress,
        @Size(max = 500) String supervisionAddress,
        @Size(max = 200) String projectName,
        @Size(max = 20) @Pattern(regexp = "^[0-9-]*$", message = "인수자 번호는 숫자와 하이픈만 허용합니다")
        String recipientPhone,
        LocalDate paymentDueDate,
        @Valid @NotEmpty List<LineRequest> lines
) {

    /**
     * 교체할 매입 라인. 기존 라인은 soft-delete 되고 본 요청 라인으로 전체 교체된다.
     *
     * <p>{@code quantity} 는 1 이상, {@code unitPrice} 는 0 이상 필수.
     */
    public record LineRequest(
            UUID productId,
            @Size(max = 200) String productName,
            @Size(max = 100) String modelName,
            @Size(max = 50) String specification,
            Integer quantity,
            BigDecimal unitPrice,
            @Size(max = 200) String note
    ) {
    }
}
