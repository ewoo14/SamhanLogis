package com.samhanair.logis.accounting.seed;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JournalSeederTest {

    @Test
    @DisplayName("SLIP_ISSUE 참조 전표번호는 SlipSeeder 와 동일하게 일련번호 0-padding 없이 생성한다")
    void pickSlipNoUsesNoPaddedSequence() throws Exception {
        Method pickSlipNo = JournalSeeder.class.getDeclaredMethod("pickSlipNo", int.class);
        pickSlipNo.setAccessible(true);

        // fresh 시드에서 deterministicId("slip", slipNo) 입력값이 SlipSeeder.formatSlipNo 와 같아야 한다.
        assertThat((String) pickSlipNo.invoke(new JournalSeeder(null), 1))
                .isEqualTo("2026/04/01-1");
    }
}
