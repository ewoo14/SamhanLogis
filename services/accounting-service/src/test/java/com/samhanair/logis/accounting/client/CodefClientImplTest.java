package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.codef.EasyCodefClient;
import com.samhanair.logis.accounting.config.CodefProperties;
import com.samhanair.logis.accounting.domain.codef.CodefConnection;
import com.samhanair.logis.accounting.domain.codef.CodefConnectionStatus;
import com.samhanair.logis.accounting.repository.CodefConnectionRepository;
import com.samhanair.logis.common.exception.BusinessException;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** CODEF 목록 조회 client 분기 회귀 테스트. */
class CodefClientImplTest {

    @Test
    @DisplayName("CODEF 은행/카드/대출 목록은 저장된 connectedId로 EasyCodefClient를 호출한다")
    void codefListMethods_delegateToEasyCodefClientWithRegisteredConnectedId() {
        CodefProperties properties = codefProperties();
        EasyCodefClient easyCodefClient = mock(EasyCodefClient.class);
        CodefConnectionRepository repository = mock(CodefConnectionRepository.class);
        CodefConnection connection = CodefConnection.create("conn-real", CodefConnectionStatus.ACTIVE);
        when(repository.findFirstByIsDeletedFalseOrderByCreatedAtAsc()).thenReturn(Optional.of(connection));
        when(easyCodefClient.listBankAccounts("conn-real"))
                .thenReturn(List.of(new AccountInfo("bank-ref", "주거래", "국민은행", "123-456")));
        when(easyCodefClient.listCards("conn-real"))
                .thenReturn(List.of(new CardInfo("card-ref", "법인카드", "국민카드", "****-1111")));
        when(easyCodefClient.listLoans("conn-real"))
                .thenReturn(List.of(new LoanInfo("loan-ref", "운전자금", "국민은행", "기업운전자금")));

        CodefClientImpl client = new CodefClientImpl(properties, Optional.of(easyCodefClient), repository);

        assertThat(client.listBankAccounts("ignored", "CODEF")).extracting(AccountInfo::ref).containsExactly("bank-ref");
        assertThat(client.listCards("ignored", "CODEF")).extracting(CardInfo::ref).containsExactly("card-ref");
        assertThat(client.listLoans("ignored", "CODEF")).extracting(LoanInfo::ref).containsExactly("loan-ref");
        verify(easyCodefClient).listBankAccounts("conn-real");
        verify(easyCodefClient).listCards("conn-real");
        verify(easyCodefClient).listLoans("conn-real");
    }

    @Test
    @DisplayName("DRY_RUN 목록은 CODEF 등록 상태와 무관하게 기존 mock을 유지한다")
    void dryRunListMethods_keepExistingMockLists() {
        CodefClientImpl client = new CodefClientImpl(codefProperties(), Optional.empty(), mock(CodefConnectionRepository.class));

        assertThat(client.listBankAccounts(null, "DRY_RUN")).hasSize(4);
        assertThat(client.listCards(null, "DRY_RUN")).hasSize(3);
        assertThat(client.listLoans(null, "DRY_RUN")).hasSize(2);
    }

    @Test
    @DisplayName("CODEF 목록 조회 시 저장된 connectedId가 없으면 미등록 오류를 반환한다")
    void codefListMethods_requireRegisteredConnectedId() {
        CodefConnectionRepository repository = mock(CodefConnectionRepository.class);
        when(repository.findFirstByIsDeletedFalseOrderByCreatedAtAsc()).thenReturn(Optional.empty());
        CodefClientImpl client = new CodefClientImpl(codefProperties(), Optional.of(mock(EasyCodefClient.class)), repository);

        assertThatThrownBy(() -> client.listBankAccounts(null, "CODEF"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("CODEF 연결 등록이 필요합니다. 먼저 금융기관을 등록하세요.");
    }

    private CodefProperties codefProperties() {
        CodefProperties properties = new CodefProperties();
        ReflectionTestUtils.setField(properties, "submitMethod", "CODEF");
        ReflectionTestUtils.setField(properties, "apiKey", "real-codef-api-key");
        ReflectionTestUtils.setField(properties, "clientId", "real-codef-client-id");
        ReflectionTestUtils.setField(properties, "clientSecret", "real-codef-client-secret");
        return properties;
    }
}
