package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 원장 조회 응답 DTO (SP-08-6-5).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" 의 기간별 + 거래처별 원장 view.
 * {@link LedgerImageResponse} 는 단일 거래처 + 단톡방 정보 포함 버전이고,
 * 본 DTO 는 다중 거래처 통합 원장 + 잔액 합계 요약 버전이다.
 *
 * <p>UUID 비공개 — partnerCode 로만 거래처 식별.
 *
 * @param periodFrom   조회 기간 시작
 * @param periodTo     조회 기간 종료
 * @param partnerCode  거래처코드 필터 (전체 조회이면 null)
 * @param totalDebit   기간 내 차변 합계
 * @param totalCredit  기간 내 대변 합계
 * @param closingBalance 기간 말 누적 잔액 (차변잔액 normal)
 * @param lines        원장 라인 목록 (시간순)
 */
public record LedgerResponse(
        LocalDate periodFrom,
        LocalDate periodTo,
        String partnerCode,
        BigDecimal totalDebit,
        BigDecimal totalCredit,
        BigDecimal closingBalance,
        List<LedgerLine> lines
) {

    /**
     * 원장 라인 1건 — 일자 / 분개번호 / 계정코드 / 거래처코드 / 적요 / 차변 / 대변 / 잔액.
     *
     * @param date        분개 일자
     * @param journalNo   분개번호 (사용자 노출 비즈니스 식별자)
     * @param accountCode 계정코드 (110/401 등)
     * @param partnerCode 거래처코드 (해당 라인의 partnerId lookup 결과 — 없으면 null)
     * @param description 적요
     * @param debit       차변
     * @param credit      대변
     * @param balance     누적 잔액 (이 라인 반영 후)
     */
    public record LedgerLine(
            LocalDate date,
            String journalNo,
            String accountCode,
            String partnerCode,
            String description,
            BigDecimal debit,
            BigDecimal credit,
            BigDecimal balance
    ) {}
}
