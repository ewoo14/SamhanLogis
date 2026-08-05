package com.samhanair.logis.slip.bundle;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.samhanair.logis.slip.estimate.web.dto.EstimateLineResponse;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.web.dto.SlipLineResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class BundleOptionRoundTripTest {

    private static final BundleSetOptions OPTIONS = new BundleSetOptions(
            "REMOTE-01", true, "PANEL-02", "사각", false);

    @Test
    void 전표_EXPAND_옵션과_계보는_revision_복원에도_동일하다() throws Exception {
        Slip slip = Slip.createOutbound("2026/08/06-1", LocalDate.of(2026, 8, 6), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                DeliveryTag.DAY, "메모", "tester");
        SlipLine line = SlipLine.create(slip, UUID.randomUUID(), "구성품", "COMP-01", null,
                1, new BigDecimal("100.00"), null);
        line.assignBundleComponent("SET-01", true, OPTIONS);
        slip.addLine(line);

        SlipSnapshot snapshot = slip.toSnapshot();
        assertThat(new com.fasterxml.jackson.databind.ObjectMapper()
                .valueToTree(snapshot.lines().get(0)).has("bundleSetOptions")).isTrue();
        slip.restoreFromSnapshot(snapshot);

        SlipLine restored = slip.getLines().get(0);
        assertThat(restored.getClass().getMethod("getBundleSetOptions").invoke(restored))
                .isEqualTo(OPTIONS);
        assertThat(SlipLineResponse.from(restored).setOptions()).isEqualTo(OPTIONS);
        assertThat(restored.getParentSetModel()).isEqualTo("SET-01");
        assertThat(restored.isSetHead()).isTrue();
    }

    @Test
    void 견적_BUNDLE_옵션은_저장_상세와_revision_복원에_동일하다() throws Exception {
        Estimate estimate = Estimate.create("2026/08/06-1", LocalDate.of(2026, 8, 6), 1,
                UUID.randomUUID(), "거래처", "123-45-67890", "주소", null, null, "tester");
        EstimateLine line = EstimateLine.create(estimate, 1, UUID.randomUUID(), "구성품",
                "COMP-01", null, 1, new BigDecimal("100.00"), null);
        line.getClass().getMethod("assignBundleComponent", String.class, boolean.class,
                BundleSetOptions.class).invoke(line, "SET-01", true, OPTIONS);
        estimate.addLine(line);

        assertThat(estimate.getLines().get(0).getClass().getMethod("getBundleSetOptions")
                .invoke(estimate.getLines().get(0))).isEqualTo(OPTIONS);
        EstimateSnapshot snapshot = estimate.toSnapshot();
        estimate.restoreFromSnapshot(snapshot);

        EstimateLine restored = estimate.getLines().get(0);
        assertThat(restored.getClass().getMethod("getBundleSetOptions").invoke(restored))
                .isEqualTo(OPTIONS);
        assertThat(EstimateLineResponse.from(restored).setOptions()).isEqualTo(OPTIONS);
        assertThat(restored.getParentSetModel()).isEqualTo("SET-01");
        assertThat(restored.isSetHead()).isTrue();
    }

    @Test
    void 구_snapshot_옵션_키_없음은_null로_하위호환된다() throws Exception {
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        SlipSnapshot.Line slipLine = mapper.readValue(
                "{\"productName\":\"구라인\",\"quantity\":1,\"unitPrice\":100}",
                SlipSnapshot.Line.class);
        EstimateSnapshot.Line estimateLine = mapper.readValue(
                "{\"productName\":\"구라인\",\"quantity\":1,\"unitPrice\":100}",
                EstimateSnapshot.Line.class);

        assertThat(mapper.valueToTree(slipLine).get("bundleSetOptions")).isNull();
        assertThat(mapper.valueToTree(estimateLine).get("bundleSetOptions")).isNull();
    }
}
