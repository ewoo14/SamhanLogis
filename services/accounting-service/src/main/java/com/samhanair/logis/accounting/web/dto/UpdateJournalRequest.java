package com.samhanair.logis.accounting.web.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 분개 DRAFT 수정 요청 — {@code PUT /accounting/journals/{id}}.
 *
 * <p>{@code expectedVersion} 은 {@link com.samhanair.logis.accounting.domain.Journal}
 * 의 {@code @Version} 값과 비교하는 낙관적 잠금 필드다.
 */
public record UpdateJournalRequest(
        @NotNull(message = "expectedVersion 은 필수입니다")
        Long expectedVersion,

        @NotNull(message = "journalDate 는 필수입니다")
        LocalDate journalDate,

        @Size(max = 500, message = "description 은 최대 500자입니다")
        String description,

        @NotNull(message = "lines 는 1개 이상 필수입니다")
        @NotEmpty(message = "lines 는 1개 이상 필수입니다")
        @Valid
        List<LineRequest> lines
) {

    /** 분개 수정 시 교체할 라인 1건. */
    public record LineRequest(
            @NotBlank(message = "accountCode 는 필수입니다")
            @Size(max = 6, message = "accountCode 는 최대 6자입니다")
            String accountCode,

            @NotNull(message = "debit 은 필수입니다 (0 이상)")
            @DecimalMin(value = "0", message = "debit 은 0 이상이어야 합니다")
            BigDecimal debit,

            @NotNull(message = "credit 은 필수입니다 (0 이상)")
            @DecimalMin(value = "0", message = "credit 은 0 이상이어야 합니다")
            BigDecimal credit,

            /** 거래처 UUID (선택) — GET 응답의 partnerId 를 PUT 왕복 시 보존한다. */
            UUID partnerId,

            @Size(max = 200, message = "partnerName 은 최대 200자입니다")
            String partnerName,

            /** 라인 메모. FE 전 스택이 note 키를 사용하므로 note/memo 양쪽을 수용한다. */
            @JsonAlias("note")
            @Size(max = 500, message = "memo 는 최대 500자입니다")
            String memo
    ) {
    }
}
