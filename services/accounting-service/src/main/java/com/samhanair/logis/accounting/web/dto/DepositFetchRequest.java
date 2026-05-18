package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

/**
 * KFTC 오픈뱅킹 입금 조회 + 자동 매칭 요청 DTO (SP-09-4).
 *
 * <p>유효성 제약:
 * <ul>
 *   <li>{@code from} — 과거 또는 오늘 날짜 필수 (@PastOrPresent)</li>
 *   <li>{@code to} — 과거 또는 오늘 날짜 필수 (@PastOrPresent)</li>
 *   <li>{@code accountFinNo} — null 허용 (전체 계좌 조회). 입력 시 비어 있으면 안 됨.</li>
 *   <li>{@code submitMethod} — "DRY_RUN" 또는 "KFTC" 만 허용 (@Pattern). null 이면 서버 property fallback.</li>
 * </ul>
 *
 * <p>from &gt; to 검증은 서비스 레이어에서 {@code DEPOSIT_DATE_RANGE_INVALID} 422 반환.
 *
 * @param from          조회 시작 일자 (포함, 필수)
 * @param to            조회 종료 일자 (포함, 필수)
 * @param accountFinNo  계좌 금융기관 코드 (선택, null 허용)
 * @param submitMethod  전송 방식 — "DRY_RUN" | "KFTC" (선택, null 이면 서버 property fallback)
 */
public record DepositFetchRequest(
        @NotNull(message = "from 날짜는 필수입니다")
        @PastOrPresent(message = "from 날짜는 오늘 이전이어야 합니다")
        LocalDate from,

        @NotNull(message = "to 날짜는 필수입니다")
        @PastOrPresent(message = "to 날짜는 오늘 이전이어야 합니다")
        LocalDate to,

        String accountFinNo,

        @Pattern(regexp = "DRY_RUN|KFTC",
                message = "submitMethod 는 DRY_RUN 또는 KFTC 만 허용됩니다")
        String submitMethod
) {
}
