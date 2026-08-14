package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 창고 QR 출고에 필요한 최소 전표 문맥.
 *
 * <p>전체 {@link SlipDetailResponse}를 재고·창고 역할에 반환하지 않기 위한 별도 계약이다.
 * 거래처·금액·주소·연락처·메모·UUID를 포함하지 않는다.
 */
public record SlipScanContextResponse(
        SlipType slipType,
        String slipNo,
        SlipStatus status,
        boolean canScan,
        List<SlipScanLineResponse> lines) {

    /** 전표 라인과 product-service 정본을 안전한 QR 입력 문맥으로 변환한다. */
    public static SlipScanContextResponse from(Slip slip, Map<UUID, ProductSummary> products) {
        List<SlipScanLineResponse> lines = slip.getLines().stream()
                .map(line -> SlipScanLineResponse.from(line.getProductId(), line.getQuantity(),
                        products.get(line.getProductId())))
                .toList();
        boolean canScan = slip.getSlipType() == SlipType.OUTBOUND
                && slip.getStatus() != SlipStatus.CANCELED
                && slip.getStatus() != SlipStatus.REJECTED;
        return new SlipScanContextResponse(slip.getSlipType(), slip.getSlipNo(), slip.getStatus(), canScan, lines);
    }
}
