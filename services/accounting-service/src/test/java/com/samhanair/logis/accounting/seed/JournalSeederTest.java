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

        // 적요/참조 텍스트의 전표번호 표기를 slip-service SlipSeeder.formatSlipNo 와 동일한 포맷
        // (yyyy/MM/dd-N, 일련번호 0제거)으로 산출하는지 검증한다.
        // (slips.id 는 random PK, journal source_ref_id 는 번호 hash 라 cross-DB row 매칭은 불가 —
        //  여기서 검증하는 것은 전표번호 텍스트 포맷 일관성뿐이다.)
        assertThat((String) pickSlipNo.invoke(new JournalSeeder(null), 1))
                .isEqualTo("2026/04/01-1");
    }
}
