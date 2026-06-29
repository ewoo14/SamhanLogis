package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.client.codef.EasyCodefClient;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterCommand;
import com.samhanair.logis.accounting.client.codef.dto.CodefRegisterResult;
import com.samhanair.logis.accounting.domain.codef.CodefInstitutionStatus;
import com.samhanair.logis.accounting.repository.CodefConnectionRepository;
import com.samhanair.logis.accounting.repository.CodefRegisteredInstitutionRepository;
import com.samhanair.logis.accounting.service.CodefConnectionService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** CODEF connectedId 등록 서비스 통합 테스트. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CodefConnectionServiceIT extends AbstractPostgresIT {

    @Autowired private CodefConnectionService service;
    @Autowired private CodefConnectionRepository connectionRepository;
    @Autowired private CodefRegisteredInstitutionRepository institutionRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private EasyCodefClient easyCodefClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("DELETE FROM codef_registered_institution");
        jdbcTemplate.update("DELETE FROM codef_connection");
    }

    @Test
    @DisplayName("신규 기관 등록은 connectedId를 생성하고 자격을 저장하지 않는다")
    void registerInstitution_createsConnectionWithoutPersistingCredentials() {
        when(easyCodefClient.registerInstitution(any()))
                .thenReturn(new CodefRegisterResult("conn-001", "ACTIVE", "등록 완료"));

        var view = service.registerInstitution(new CodefRegisterCommand(
                null, "BANK", "0004", "1", Map.of("id", "sandbox-user", "password", "secret-pw")));

        assertThat(view.status()).isEqualTo(CodefInstitutionStatus.ACTIVE);
        assertThat(connectionRepository.findFirstByIsDeletedFalseOrderByCreatedAtAsc())
                .hasValueSatisfying(connection -> assertThat(connection.getConnectedId()).isEqualTo("conn-001"));
        assertThat(institutionRepository.findAll()).hasSize(1);
        Integer credentialColumnCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_name IN ('codef_connection', 'codef_registered_institution')
                   AND column_name IN ('id_value', 'password', 'cert_password', 'credentials')
                """, Integer.class);
        assertThat(credentialColumnCount).isZero();
    }

    @Test
    @DisplayName("기존 connectedId가 있으면 add 경로로 등록 요청을 전달한다")
    void registerInstitution_usesExistingConnectedIdForAdd() {
        when(easyCodefClient.registerInstitution(any()))
                .thenReturn(new CodefRegisterResult("conn-001", "ACTIVE", "등록 완료"));
        service.registerInstitution(new CodefRegisterCommand(null, "BANK", "0004", "1", Map.of("id", "first")));

        service.registerInstitution(new CodefRegisterCommand(null, "CARD", "0301", "1", Map.of("id", "second")));

        ArgumentCaptor<CodefRegisterCommand> captor = ArgumentCaptor.forClass(CodefRegisterCommand.class);
        verify(easyCodefClient, org.mockito.Mockito.times(2)).registerInstitution(captor.capture());
        assertThat(captor.getAllValues().get(1).connectedId()).isEqualTo("conn-001");
    }

    @Test
    @DisplayName("ADDITIONAL_AUTH 등록 결과는 기관 상태로 저장한다")
    void registerInstitution_storesAdditionalAuthStatus() {
        when(easyCodefClient.registerInstitution(any()))
                .thenReturn(new CodefRegisterResult("conn-2fa", "ADDITIONAL_AUTH", "추가 인증 필요"));

        var view = service.registerInstitution(new CodefRegisterCommand(null, "BANK", "0004", "1", Map.of("id", "u")));

        assertThat(view.status()).isEqualTo(CodefInstitutionStatus.ADDITIONAL_AUTH);
    }

    @Test
    @DisplayName("목록 조회는 저장된 connectedId로 EasyCodefClient를 호출한다")
    void listMethods_delegateWithRegisteredConnectedId() {
        when(easyCodefClient.registerInstitution(any()))
                .thenReturn(new CodefRegisterResult("conn-list", "ACTIVE", "등록 완료"));
        service.registerInstitution(new CodefRegisterCommand(null, "BANK", "0004", "1", Map.of("id", "u")));
        when(easyCodefClient.listBankAccounts("conn-list")).thenReturn(List.of(new AccountInfo("a", "계좌", "은행", "1")));
        when(easyCodefClient.listCards("conn-list")).thenReturn(List.of(new CardInfo("c", "카드", "카드사", "2")));
        when(easyCodefClient.listLoans("conn-list")).thenReturn(List.of(new LoanInfo("l", "대출", "은행", "3")));

        assertThat(service.listAccounts()).hasSize(1);
        assertThat(service.listCards()).hasSize(1);
        assertThat(service.listLoans()).hasSize(1);
    }
}
