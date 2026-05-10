package com.samhanair.logis.accounting.report;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 거래처별 미수/미지급금 집계 행 (Partner Aging Line).
 *
 * <p>UUID 사용자 노출 금지 원칙 (메모리 {@code feedback_uuid_no_user_visibility.md}):
 * partnerId 는 내부 참조용으로만 사용하고, 화면에는 partnerCode / partnerName 만 노출.
 * partnerId 가 null 인 라인은 "기타" 그룹으로 집계.
 *
 * <p>agingDays 계산: asOfDate - oldestUnpaidDate (일수). oldestUnpaidDate 가 없으면 0.
 *
 * @param partnerId        거래처 UUID (내부 참조용 — 화면 노출 X)
 * @param partnerCode      거래처 코드 (사용자 노출)
 * @param partnerName      거래처명 (사용자 노출)
 * @param balance          잔액 (양수 = 미수/미지급 잔존)
 * @param oldestUnpaidDate 가장 오래된 미결 분개 일자 (없으면 null)
 * @param agingDays        경과 일수 (asOfDate - oldestUnpaidDate, 없으면 0)
 */
public record PartnerAgingLine(
        String partnerId,
        String partnerCode,
        String partnerName,
        BigDecimal balance,
        LocalDate oldestUnpaidDate,
        int agingDays
) {}
