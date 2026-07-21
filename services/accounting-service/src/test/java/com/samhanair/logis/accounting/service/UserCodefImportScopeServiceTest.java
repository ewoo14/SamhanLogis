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

    private static final UUID USER_ID = UUID.randomUUID();

    @Test
    @DisplayName("서비스 이중 가드 — SELECTED 빈 ref 목록은 transaction 전에 차단")
    void selectedWithoutRefsRejectedBeforeTransaction() {
        assertThatThrownBy(() -> service().upsert(USER_ID, request(List.of(), List.of(), List.of(), "SELECTED")))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("scopeMode");
    }

    @Test
    @DisplayName("서비스 이중 가드 — null scopeMode는 DTO 우회 직접 호출에서도 차단")
    void nullScopeModeRejectedBeforeTransaction() {
        assertThatThrownBy(() -> service().upsert(USER_ID, request(List.of(), List.of(), List.of(), null)))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("scopeMode");
    }

    @Test
    @DisplayName("서비스 이중 가드 — 미지 scopeMode는 DTO 우회 직접 호출에서도 차단")
    void invalidScopeModeRejectedBeforeTransaction() {
        assertThatThrownBy(() -> service().upsert(USER_ID, request(List.of(), List.of(), List.of(), "BROKEN")))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("scopeMode");
    }

    @Test
    @DisplayName("서비스 이중 가드 — ALL과 선택 ref의 반대 모순도 DTO 우회 직접 호출에서 차단")
    void allWithRefsRejectedBeforeTransaction() {
        assertThatThrownBy(() -> service().upsert(USER_ID, request(List.of("bank-ref"), List.of(), List.of(), "ALL")))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("scopeMode");
    }

    private static UserCodefImportScopeService service() {
        return new UserCodefImportScopeService(
                mock(UserCodefImportScopeRepository.class), mock(PlatformTransactionManager.class));
    }

    private static CodefImportScopeRequest request(List<String> accountRefs, List<String> cardRefs,
                                                    List<String> loanRefs, String scopeMode) {
        return new CodefImportScopeRequest(
                "connected-main", accountRefs, cardRefs, loanRefs,
                com.samhanair.logis.accounting.web.dto.CodefImportType.ALL, scopeMode);
    }
}
