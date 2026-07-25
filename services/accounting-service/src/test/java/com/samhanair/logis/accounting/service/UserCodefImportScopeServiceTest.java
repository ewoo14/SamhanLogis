package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import com.samhanair.logis.accounting.repository.UserCodefImportScopeRepository;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeRequest;
import com.samhanair.logis.accounting.web.dto.CodefImportType;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.Optional;
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

    /**
     * D-S5-13 배포순서 pin — 기존 행 + {@code version} 필드 자체가 없는 요청(구버전 데스크톱)
     * 조합이 409 로 거부되는 것이 "사고"가 아니라 "의도된 계약"임을 못박는다.
     *
     * <p>PM 추가 지시(2026-07-25) — 이 조합을 실행하는 테스트가 0건이어서 코드만 보고는
     * 의도된 계약인지 우연인지 구별할 수 없었다. 개발책임자 결정: {@link UserCodefImportScopeService}의
     * {@code requestedVersion == null} → 409 판정은 바꾸지 않는다(#920 이전 빌드는 배포
     * 순서로 해결 — 데스크톱 forceLevel=CRITICAL 강제 업데이트를 선행한 뒤 이 서비스를
     * 배포하므로, 구버전이 이 409 를 만나는 창 자체가 없다). 이 테스트는 그 유지 결정의
     * 회귀 가드다 — 이 분기가 실수로 완화되면(예: null 을 첫 저장처럼 관대하게 받아들이면)
     * 여기서 즉시 RED 가 된다.
     *
     * <p>{@link CodefImportScopeRequest}의 6-인자 생성자(잠금값 도입 전 소스 호환용, DTO
     * Javadoc 참조)로 "version 필드 자체가 없는" 구버전 클라이언트 요청 모양을 재현한다.
     */
    @Test
    @DisplayName("D-S5-13 배포순서 pin — version 필드 자체가 없는 요청(구버전 클라이언트)이 기존 행을 만나면 409로 거부한다")
    void missingVersionFieldOnExistingRowRejectedWith409() {
        UserCodefImportScopeRepository repository = mock(UserCodefImportScopeRepository.class);
        UserCodefImportScope existing = UserCodefImportScope.create(USER_ID, "connected-main");
        when(repository.findByUserIdAndConnectedId(USER_ID, "connected-main"))
                .thenReturn(Optional.of(existing));

        // #920 이전(소스 호환) 6-인자 생성자 — version 은 null 로 채워진다(요청 본문에
        // version 필드 자체가 없는 구버전 클라이언트를 재현).
        CodefImportScopeRequest legacyRequestWithoutVersionField = new CodefImportScopeRequest(
                "connected-main", List.of("bank-ref"), List.of(), List.of(),
                CodefImportType.BANK, "SELECTED");

        assertThatThrownBy(() -> service(repository).upsert(USER_ID, legacyRequestWithoutVersionField))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT));
    }

    private static UserCodefImportScopeService service() {
        return service(mock(UserCodefImportScopeRepository.class));
    }

    private static UserCodefImportScopeService service(UserCodefImportScopeRepository repository) {
        return new UserCodefImportScopeService(repository, mock(PlatformTransactionManager.class));
    }

    private static CodefImportScopeRequest request(List<String> accountRefs, List<String> cardRefs,
                                                    List<String> loanRefs, String scopeMode) {
        return new CodefImportScopeRequest(
                "connected-main", accountRefs, cardRefs, loanRefs,
                com.samhanair.logis.accounting.web.dto.CodefImportType.ALL, scopeMode);
    }
}
