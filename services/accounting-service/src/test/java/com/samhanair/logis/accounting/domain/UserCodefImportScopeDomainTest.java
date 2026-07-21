package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.accounting.web.dto.CodefImportType;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class UserCodefImportScopeDomainTest {

    @Test
    void updateSelectionsRejectsMissingScopeModeInsteadOfKeepingPreviousMode() {
        UserCodefImportScope scope = UserCodefImportScope.create(
                UUID.randomUUID(), "connected-main");

        assertThatThrownBy(() -> scope.updateSelections(
                List.of("bank-ref"), List.of(), List.of(), CodefImportType.BANK, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("scopeMode");
    }
}
