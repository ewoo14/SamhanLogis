package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;

/**
 * #1144 Q4 RED — 원천전표 키가 없는 legacy 세금계산서도 세금계산서 축에서
 * 생성 가능 자료와 읽기전용 자료를 구분해야 한다.
 *
 * <p>실데이터에는 원천전표 키를 보충하지 않는다. 목록 계약 자체가 판정과 사유를
 * 운반할 수 있는지부터 고정한다.
 */
class TaxInvoiceLegacyReadOnlyContractRedTest {

    @Test
    void 세금계산서_목록_계약은_legacy_읽기전용_판정과_사유를_운반해야_한다() {
        var componentNames = Arrays.stream(TaxInvoiceSummaryResponse.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName)
                .toList();

        assertThat(componentNames)
                .as("원천전표 키가 없는 legacy 세금계산서는 세금계산서 축에서 명시적으로 읽기전용이어야 한다")
                .contains("legacyReadOnly", "eligibilityReasons");
    }
}
