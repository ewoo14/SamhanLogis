package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 입금보고서 수기 생성/수정 요청. */
public record CashReceiptRequest(
        @Size(max = 100, message = "partnerCode 는 최대 100자입니다")
        String partnerCode,

        @Size(max = 30, message = "bizNo 는 최대 30자입니다")
        String bizNo,

        @Size(max = 100, message = "partnerName 는 최대 100자입니다")
        String partnerName,

        @NotNull(message = "amount 는 필수입니다")
        @DecimalMin(value = "0.01", message = "amount 는 0보다 커야 합니다")
        BigDecimal amount,

        @NotNull(message = "transactionDate 는 필수입니다")
        LocalDate transactionDate,

        // 494 = 분개 라인 memo 한도 500 − "[역분개] " prefix 6자. 495자 이상이면 CONFIRMED 행의
        // 취소/수정(역분개 라인 생성)이 영구 봉쇄되므로 입력 단계에서 차단한다.
        @Size(max = 494, message = "memo 는 최대 494자입니다")
        String memo,

        @Size(max = 20, message = "debitAccountCode 는 최대 20자입니다")
        String debitAccountCode,

        @Size(max = 20, message = "creditAccountCode 는 최대 20자입니다")
        String creditAccountCode,

        /** 마지막 빈행은 전송하지 않는다. 비어 있으면 legacy 단일 금액 계약을 유지한다. */
        List<CashReceiptLineRequest> lines
) {
}
