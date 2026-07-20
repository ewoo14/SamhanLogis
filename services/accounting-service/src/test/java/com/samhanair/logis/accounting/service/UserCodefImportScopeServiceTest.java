package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.samhanair.logis.accounting.repository.UserCodefImportScopeRepository;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeRequest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

class UserCodefImportScopeServiceTest {

    @Test
    @DisplayName("서비스 이중 가드 — SELECTED 빈 ref 목록은 transaction 전에 차단")
    void selectedWithoutRefsRejectedBeforeTransaction() {
        UserCodefImportScopeService service = new UserCodefImportScopeService(
                mock(UserCodefImportScopeRepository.class), mock(PlatformTransactionManager.class));

        assertThatThrownBy(() -> service.upsert(UUID.randomUUID(), new CodefImportScopeRequest(
                        "connected-main", List.of(), List.of(), List.of(),
                        com.samhanair.logis.accounting.web.dto.CodefImportType.ALL, "SELECTED")))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("scopeMode");
    }
}
