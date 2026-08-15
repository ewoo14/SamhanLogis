package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.AccountingPostedAtClient;
import com.samhanair.logis.slip.client.DcConfigReadClient;
import com.samhanair.logis.slip.client.ProductPriceHistoryClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.web.dto.DailyClosingRowResponse.SourceValues;
import java.util.ArrayList;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** S2 타 서비스 5열 원천을 한 행 단위로 결합한다. 조회 실패는 판정불가 사유로 보존한다. */
@Component
@RequiredArgsConstructor
public class DailyClosingSourceResolver {
    private final ProductPriceHistoryClient productPriceHistoryClient;
    private final DcConfigReadClient dcConfigReadClient;
    private final AccountingPostedAtClient accountingPostedAtClient;

    public SourceValues resolve(Slip slip, SlipLine line) {
        Optional<java.math.BigDecimal> productPrice = productPriceHistoryClient
                .applicable(line.getProductId(), slip.getSlipDate());
        Optional<String> dcCondition = dcConfigReadClient.condition(slip.getPartnerCode());
        java.time.LocalDateTime postedAt = accountingPostedAtClient.find(slip.getSlipNo());
        ArrayList<String> missing = new ArrayList<>();
        if (productPrice.isEmpty()) missing.add("출고가");
        if (dcCondition.isEmpty()) missing.add("DC조건");
        if (postedAt == null) missing.add("회계반영일자(posted_at)");
        return new SourceValues(productPrice.orElse(null), dcCondition.orElse(null), postedAt,
                missing.isEmpty() ? null : String.join(", ", missing) + " 원천 미확보");
    }
}
