package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 사용자별 은행·카드·대출 가져오기 선택 저장 요청. */
public record CodefImportScopeRequest(
        @NotBlank(message = "connectedId 는 필수입니다")
        @Size(max = 128, message = "connectedId 는 최대 128자입니다")
        String connectedId,

        List<@NotBlank(message = "accountRefs 항목은 비어있을 수 없습니다") String> accountRefs,

        List<@NotBlank(message = "cardRefs 항목은 비어있을 수 없습니다") String> cardRefs,

        List<@NotBlank(message = "loanRefs 항목은 비어있을 수 없습니다") String> loanRefs,

        @NotNull(message = "기본 가져오기 구분은 필수입니다")
        CodefImportType defaultImportType
) {
}
