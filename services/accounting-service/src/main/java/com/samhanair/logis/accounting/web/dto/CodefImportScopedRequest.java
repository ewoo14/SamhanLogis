package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/** 다중 ref/저장 scope 기반 거래내역 import 요청. */
public record CodefImportScopedRequest(
        @NotBlank(message = "connectedId 는 필수입니다")
        @Size(max = 128, message = "connectedId 는 최대 128자입니다")
        String connectedId,

        @NotNull(message = "from 날짜는 필수입니다")
        @PastOrPresent(message = "from 날짜는 오늘 이전이어야 합니다")
        LocalDate from,

        @NotNull(message = "to 날짜는 필수입니다")
        @PastOrPresent(message = "to 날짜는 오늘 이전이어야 합니다")
        LocalDate to,

        CodefImportType type,

        List<@NotBlank(message = "accountRefs 항목은 비어있을 수 없습니다") String> accountRefs,

        List<@NotBlank(message = "cardRefs 항목은 비어있을 수 없습니다") String> cardRefs,

        List<@NotBlank(message = "loanRefs 항목은 비어있을 수 없습니다") String> loanRefs,

        @Pattern(regexp = "DRY_RUN|CODEF", message = "전송 방식 값이 올바르지 않습니다")
        String submitMethod
) {
}
