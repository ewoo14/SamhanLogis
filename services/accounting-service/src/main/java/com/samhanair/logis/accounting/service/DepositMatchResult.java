package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import com.samhanair.logis.accounting.domain.PartnerMatchSource;

/**
 * 입금 거래 단건 매칭 결과 — 서비스 레이어 내부 모델 (SP-09-4).
 *
 * <p>UUID 비공개 원칙 (feedback_uuid_no_user_visibility):
 * {@code journalDraftId} 는 서비스 내부 추적용. 외부 응답 DTO 로 변환 시 UUID 를 노출하지 않는다.
 * 사용자 식별자는 {@code matchedPartnerCode} / {@code matchedTaxInvoiceNo} (비즈니스 식별자).
 *
 * <p>#810 R3-CODEX (S1-M1) — {@code lookupUnavailable} 로 단건 lookup disposition 을 보존한다.
 * 거래처 조회 일시 장애(UNAVAILABLE)를 일반 UNMATCHED 로 붕괴시키면 응답에서 "정상 미존재"와
 * "조회 장애(재시도 대상)"를 구분할 수 없다. status 는 UNMATCHED 를 유지하되 본 플래그로
 * 응답 집계({@code unavailableSkippedCount})에 반영한다.
 *
 * @param depositorName       입금자명 (KFTC 응답 그대로)
 * @param amount              입금액
 * @param transactionDate     거래 일자
 * @param matchedPartnerCode  매칭된 거래처 코드 (미매칭 시 null)
 * @param matchedTaxInvoiceNo 매칭된 세금계산서 번호 (미매칭 시 null)
 * @param journalDraftId      생성된 분개 DRAFT UUID (서비스 내부용, 응답 미노출)
 * @param status              매칭 상태 — {@link DepositMatchStatus#MATCHED} | {@link DepositMatchStatus#UNMATCHED}
 * @param lookupUnavailable   거래처 조회 일시 장애로 매칭이 보류된 행 여부 (재시도 대상 집계용)
 */
public record DepositMatchResult(
        String depositorName,
        BigDecimal amount,
        LocalDate transactionDate,
        String matchedPartnerCode,
        String matchedTaxInvoiceNo,
        UUID journalDraftId,
        DepositMatchStatus status,
        PartnerMatchSource matchSource,
        String mappingRawName,
        String mappingNormalizedName,
        boolean lookupUnavailable
) {

    /** 기존 7개 필드 내부 호출 호환용 생성자. */
    public DepositMatchResult(String depositorName, BigDecimal amount, LocalDate transactionDate,
                              String matchedPartnerCode, String matchedTaxInvoiceNo,
                              UUID journalDraftId, DepositMatchStatus status) {
        this(depositorName, amount, transactionDate, matchedPartnerCode, matchedTaxInvoiceNo,
                journalDraftId, status, null, null, null, false);
    }

    /** lookup disposition 도입 이전 10-인자 호환 생성자 (#810 R3-CODEX S1-M1 additive). */
    public DepositMatchResult(String depositorName, BigDecimal amount, LocalDate transactionDate,
                              String matchedPartnerCode, String matchedTaxInvoiceNo,
                              UUID journalDraftId, DepositMatchStatus status,
                              PartnerMatchSource matchSource, String mappingRawName,
                              String mappingNormalizedName) {
        this(depositorName, amount, transactionDate, matchedPartnerCode, matchedTaxInvoiceNo,
                journalDraftId, status, matchSource, mappingRawName, mappingNormalizedName, false);
    }
}
