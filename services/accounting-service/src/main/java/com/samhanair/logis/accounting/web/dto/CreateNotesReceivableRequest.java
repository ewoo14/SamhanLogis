package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.NoteStatus;
import com.samhanair.logis.accounting.domain.NoteType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/** 받을어음 등록 요청. partnerId UUID 는 받지 않는다. */
public record CreateNotesReceivableRequest(
        @Size(max = 100) String partnerCode,
        @Size(max = 20) String bizNo,
        @Size(max = 100) String partnerName,
        @NotBlank @Size(max = 50) String noteNo,
        @NotNull LocalDate issueDate,
        @NotNull LocalDate maturityDate,
        @NotNull @DecimalMin(value = "0.01") BigDecimal amount,
        @NotNull NoteType noteType,
        NoteStatus status,
        @Size(max = 1000) String memo
) {
}
