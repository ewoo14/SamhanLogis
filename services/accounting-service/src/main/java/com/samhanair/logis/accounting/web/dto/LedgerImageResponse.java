package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 거래처별 원장 데이터 (PR-E2 BE-A9).
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" — 분개 line + 거래처 snapshot + 단톡방 정보.
 *
 * <p>UUID 비공개 — partnerCode + partnerName + slipNo (journalNo) 만 사용자 노출.
 *
 * @param partnerCode 거래처코드 (사용자 노출 식별자)
 * @param partnerName 거래처 사업자명
 * @param partnerBusinessNo 사업자등록번호 (선택)
 * @param chatRoomNames 단톡방 이름 리스트 (notification-service 매핑 — 0~N건, fail-soft)
 * @param periodFrom 원장 기간 시작
 * @param periodTo 원장 기간 종료
 * @param lines 분개 라인 목록 (시간순)
 */
public record LedgerImageResponse(
        String partnerCode,
        String partnerName,
        String partnerBusinessNo,
        List<String> chatRoomNames,
        LocalDate periodFrom,
        LocalDate periodTo,
        List<LedgerLine> lines) {

    /**
     * 원장 라인 1건 — 일자 / 분개번호 / 계정코드 / 계정명 / 적요 / 차변 / 대변 / 누적 잔액.
     *
     * @param date        분개 일자
     * @param journalNo   분개번호 (사용자 노출, UUID 대신)
     * @param accountCode 이카운트 4자리 계정 코드 (1089/4019/2559 등)
     * @param accountName 계정명 — SP-08-FU2 P2-4 신규. ChartOfAccount 마스터 lookup 결과.
     *                    해당 코드의 계정과목이 없거나 조회 실패 시 null.
     * @param description 적요
     * @param debit       차변 금액 (0 가능)
     * @param credit      대변 금액 (0 가능)
     * @param balance     누적 잔액 (해당 라인 적용 후, 차변잔액 normal)
     */
    public record LedgerLine(
            LocalDate date,
            String journalNo,
            String accountCode,
            String accountName,
            String description,
            BigDecimal debit,
            BigDecimal credit,
            BigDecimal balance) {
    }
}
