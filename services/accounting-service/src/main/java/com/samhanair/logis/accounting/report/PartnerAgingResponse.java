package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 거래처별 미수/미지급금 (Partner Aging) 응답 DTO.
 *
 * <p>집계 대상: POSTED+REVERSED(보상쌍 상쇄) 분개 라인 (journalDate &lt;= asOfDate).
 *
 * <p>계정 코드:
 * <ul>
 *   <li>RECEIVABLE: 1089 외상매출금 — debit - credit = 미수 잔액</li>
 *   <li>PAYABLE: 2519 외상매입금 — credit - debit = 미지급 잔액</li>
 * </ul>
 *
 * <p>partnerId 가 null 인 분개 라인은 "기타" 그룹으로 집계.
 *
 * @param asOfDate      기준 일자
 * @param type          조회 유형 ("RECEIVABLE" / "PAYABLE")
 * @param accountCode   대상 계정 코드 ("1089" 또는 "2519")
 * @param accountName   계정명 ("외상매출금" 또는 "외상매입금")
 * @param totalAmount   거래처별 잔액 합계
 * @param partnerCount  거래처 수 (잔액 양수인 거래처만 포함, "기타" 제외)
 * @param lines         거래처별 집계 행 목록 (잔액 내림차순 정렬)
 * @param generatedAt   보고서 생성 시각
 */
public record PartnerAgingResponse(
        LocalDate asOfDate,
        String type,
        String accountCode,
        String accountName,
        BigDecimal totalAmount,
        int partnerCount,
        List<PartnerAgingLine> lines,
        LocalDateTime generatedAt
) {}
