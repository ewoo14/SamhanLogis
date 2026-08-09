package com.samhanair.logis.slip.service.closing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.dto.closing.CreateSlipClosingBaselineRequest;
import com.samhanair.logis.slip.dto.closing.SlipClosingBaselineResponse;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SlipClosingBaselineAdminServiceTest {

    private static final LocalDate DATE = LocalDate.of(2026, 8, 8);

    @Mock
    private SlipClosingBaselineRepository repository;

    @Test
    void create_reusesSeededDisabledBaselineAndEnablesIt() {
        SlipClosingBaseline seeded = SlipClosingBaseline.active(SlipType.OUTBOUND, DATE, false);
        when(repository.findBySlipTypeAndIsDeletedFalse(SlipType.OUTBOUND)).thenReturn(Optional.of(seeded));

        SlipClosingBaselineResponse response = new SlipClosingBaselineAdminService(repository).create(
                new CreateSlipClosingBaselineRequest(SlipType.OUTBOUND, DATE));
        assertThat(response.baselineDate()).isEqualTo(DATE);
        assertThat(seeded.isEnabled()).isTrue();
    }

    @Test
    void create_duplicateEnabledBaseline_returnsConflict() {
        when(repository.findBySlipTypeAndIsDeletedFalse(SlipType.OUTBOUND))
                .thenReturn(Optional.of(SlipClosingBaseline.active(SlipType.OUTBOUND, DATE, true)));

        assertThatThrownBy(() -> new SlipClosingBaselineAdminService(repository).create(
                new CreateSlipClosingBaselineRequest(SlipType.OUTBOUND, DATE)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 마감 기준선");
    }

    @Test
    void delete_softDeletesBaseline() {
        SlipClosingBaseline baseline = SlipClosingBaseline.active(SlipType.INBOUND, DATE, true);
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(baseline));

        // ID is an internal route in production; this test focuses on the soft-delete invariant.
        new SlipClosingBaselineAdminService(repository).delete(id, "manager");
        assertThat(baseline.getIsDeleted()).isTrue();
    }
}
