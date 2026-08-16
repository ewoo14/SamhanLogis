package com.samhanair.logis.slip.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DailyClosingRowResponseTest {

    @Test
    void dailyClosingResponse_exposesModelNameForTheDetailRow() {
        assertThat(Arrays.stream(DailyClosingRowResponse.class.getRecordComponents())
                .map(component -> component.getName()))
                .contains("modelName");
    }

    @Test
    void from_copiesModelNameSnapshotFromSlipLine() {
        Slip slip = mock(Slip.class);
        SlipLine line = mock(SlipLine.class);
        when(line.getModelName()).thenReturn("MODEL-001");
        when(line.getQuantity()).thenReturn(1);

        DailyClosingRowResponse response = DailyClosingRowResponse.from(slip, line);

        assertThat(response.modelName()).isEqualTo("MODEL-001");
    }
}
