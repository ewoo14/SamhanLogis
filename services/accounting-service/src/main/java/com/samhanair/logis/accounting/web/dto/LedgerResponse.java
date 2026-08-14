package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.report.BalanceDirection;
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
 * <p>UUID 비공개 — bizNo/partnerCode 로만 거래처 식별.
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
     * 원장 라인 1건 — 일자 / 분개번호 / 계정코드 / 계정명 / 계정분류 / 잔액방향 / 사업자번호 / 거래처코드 / 적요 / 차변 / 대변 / 잔액.
     *
     * @param date        분개 일자
     * @param journalNo   분개번호 (사용자 노출 비즈니스 식별자)
     * @param accountCode 계정코드 (1089/4019 등)
     * @param accountName 계정명 — SP-08-FU2 P2-4 신규. ChartOfAccount 마스터 lookup 결과.
     *                    해당 코드의 계정과목이 없거나 조회 실패 시 null.
     * @param accountCategory 계정 카테고리. 총계정원장 화면 grouping 메타.
     * @param accountCategoryDisplayName 계정 카테고리 한국어 표시명.
     * @param balanceDirection 채권/채무 등 정상 잔액 방향 메타.
     * @param balanceDirectionDisplayName 정상 잔액 방향 한국어 표시명.
     * @param bizNo 사업자번호 숫자 문자열. 미조회 시 빈 문자열
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
            String accountName,
            AccountCategory accountCategory,
            String accountCategoryDisplayName,
            BalanceDirection balanceDirection,
            String balanceDirectionDisplayName,
            String bizNo,
            String partnerCode,
            String description,
            BigDecimal debit,
            BigDecimal credit,
            BigDecimal balance
    ) {
        /**
         * 기존 총계정원장 호출부/테스트 호환용 생성자.
         *
         * <p>신규 화면은 확장 필드를 사용하지만, 기존 코드 경로는 계정 메타가 없어도
         * 동일 JSON 필드를 null 로 내려받을 수 있다.
         */
        public LedgerLine(
                LocalDate date,
                String journalNo,
                String accountCode,
                String accountName,
                String partnerCode,
                String description,
                BigDecimal debit,
                BigDecimal credit,
                BigDecimal balance
        ) {
            this(date, journalNo, accountCode, accountName, "", partnerCode,
                    description, debit, credit, balance);
        }

        public LedgerLine(
                LocalDate date,
                String journalNo,
                String accountCode,
                String accountName,
                String bizNo,
                String partnerCode,
                String description,
                BigDecimal debit,
                BigDecimal credit,
                BigDecimal balance
        ) {
            this(date, journalNo, accountCode, accountName, null, null, null, null,
                    bizNo, partnerCode, description, debit, credit, balance);
        }
    }
}
