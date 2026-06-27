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
        @NotBlank(message = "연결 식별자는 필수입니다")
        @Size(max = 128, message = "연결 식별자는 최대 128자입니다")
        String connectedId,

        @NotNull(message = "시작 날짜는 필수입니다")
        @PastOrPresent(message = "시작 날짜는 오늘 또는 이전이어야 합니다")
        LocalDate from,

        @NotNull(message = "종료 날짜는 필수입니다")
        @PastOrPresent(message = "종료 날짜는 오늘 또는 이전이어야 합니다")
        LocalDate to,

        CodefImportType type,

        List<@NotBlank(message = "계좌 식별값은 비어있을 수 없습니다") String> accountRefs,

        List<@NotBlank(message = "카드 식별값은 비어있을 수 없습니다") String> cardRefs,

        List<@NotBlank(message = "대출 식별값은 비어있을 수 없습니다") String> loanRefs,

        // DRY_RUN/CODEF 는 서버-클라이언트 계약에 쓰는 기술 식별자다. 사용자 노출 오류 메시지만 한국어로 유지한다.
        @Pattern(regexp = "DRY_RUN|CODEF", message = "전송 방식 값이 올바르지 않습니다")
        String submitMethod
) {
}
