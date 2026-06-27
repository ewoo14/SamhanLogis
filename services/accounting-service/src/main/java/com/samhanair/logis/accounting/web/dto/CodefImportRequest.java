package com.samhanair.logis.accounting.web.dto;

import io.swagger.v3.oas.annotations.media.Schema;
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
        @NotNull(message = "시작 날짜는 필수입니다")
        @PastOrPresent(message = "시작 날짜는 오늘 또는 이전이어야 합니다")
        LocalDate from,

        @NotNull(message = "종료 날짜는 필수입니다")
        @PastOrPresent(message = "종료 날짜는 오늘 또는 이전이어야 합니다")
        LocalDate to,

        CodefImportType type,

        @Pattern(regexp = ".*\\S.*", message = "계좌 식별값은 비어있지 않은 문자열이어야 합니다")
        String accountRef,

        @Pattern(regexp = ".*\\S.*", message = "카드 식별값은 비어있지 않은 문자열이어야 합니다")
        String cardRef,

        @Pattern(regexp = ".*\\S.*", message = "대출 식별값은 비어있지 않은 문자열이어야 합니다")
        String loanRef,

        // DRY_RUN/CODEF 는 서버-클라이언트 계약에 쓰는 기술 식별자다. 사용자 노출 오류 메시지만 한국어로 유지한다.
        @Schema(hidden = true)
        @Pattern(regexp = "DRY_RUN|CODEF", message = "전송 방식 값이 올바르지 않습니다")
        String submitMethod
) {
}
