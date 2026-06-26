package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

/**
 * CODEF 은행·카드 거래내역 온디맨드 import 요청 DTO.
 *
 * <p>{@code type} 이 null 이면 {@code ALL} 로 처리한다. 요청 대상별 ref 교차 필드 검증은 서비스 레이어에서
 * {@code INVALID_INPUT} 으로 처리한다.
 *
 * @param from         조회 시작 일자
 * @param to           조회 종료 일자
 * @param type         조회 대상. null 이면 ALL
 * @param accountRef   은행 계좌 표시 식별자
 * @param cardRef      카드 표시 식별자
 * @param loanRef      대출 표시 식별자
 * @param submitMethod 전송 방식 — DRY_RUN | CODEF. null 이면 서버 property fallback
 */
public record CodefImportRequest(
        @NotNull(message = "from 날짜는 필수입니다")
        @PastOrPresent(message = "from 날짜는 오늘 이전이어야 합니다")
        LocalDate from,

        @NotNull(message = "to 날짜는 필수입니다")
        @PastOrPresent(message = "to 날짜는 오늘 이전이어야 합니다")
        LocalDate to,

        CodefImportType type,

        @Pattern(regexp = ".*\\S.*", message = "accountRef 는 null 또는 비어있지 않은 문자열이어야 합니다")
        String accountRef,

        @Pattern(regexp = ".*\\S.*", message = "cardRef 는 null 또는 비어있지 않은 문자열이어야 합니다")
        String cardRef,

        @Pattern(regexp = ".*\\S.*", message = "loanRef 는 null 또는 비어있지 않은 문자열이어야 합니다")
        String loanRef,

        @Pattern(regexp = "DRY_RUN|CODEF", message = "submitMethod 는 DRY_RUN 또는 CODEF 만 허용됩니다")
        String submitMethod
) {
}
