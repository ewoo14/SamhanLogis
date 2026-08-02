package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipType;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 그룹웨어 결재 전표 참조 자동완성 응답.
 *
 * <p>UUID 비공개 가드에 따라 내부 식별자({@code slipId}, {@code partnerId})는 포함하지 않는다.
 * 화면 선택과 첨부 저장에 필요한 전표번호, 전표유형, 거래처명, 합계금액, 전표일자만 노출한다.
 *
 * @param slipNo 전표번호
 * @param slipType 전표 유형
 * @param partnerName 거래처명
 * @param totalAmount 라인 합계금액
 * @param slipDate 전표일자
 */
public record SlipSearchResult(
        String slipNo,
        SlipType slipType,
        String partnerName,
        BigDecimal totalAmount,
        /** 사용자 화면에 표시할 부가세 포함 전표 금액. */
        BigDecimal displayTotalAmount,
        LocalDate slipDate) {

    /**
     * 전표 엔티티를 검색 응답으로 변환한다.
     *
     * @param slip 활성 전표 엔티티
     * @return UUID 없는 전표 검색 응답
     */
    public static SlipSearchResult from(Slip slip) {
        BigDecimal totalAmount = slip.getLines().stream()
                .map(SlipLine::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal displayTotalAmount = SlipDisplayAmount.vatInclusiveTotal(slip.getLines());
        return new SlipSearchResult(
                slip.getSlipNo(),
                slip.getSlipType(),
                slip.getPartnerName(),
                totalAmount,
                displayTotalAmount,
                slip.getSlipDate());
    }
}
