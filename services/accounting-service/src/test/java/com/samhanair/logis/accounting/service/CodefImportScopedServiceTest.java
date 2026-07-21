package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.AccountInfo;
import com.samhanair.logis.accounting.client.CardInfo;
import com.samhanair.logis.accounting.client.CodefClient;
import com.samhanair.logis.accounting.client.LoanInfo;
import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import com.samhanair.logis.accounting.domain.CodefScopeMode;
import com.samhanair.logis.accounting.web.dto.CodefImportResponse;
import com.samhanair.logis.accounting.web.dto.CodefImportType;
import com.samhanair.logis.common.exception.BusinessException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link CodefImportScopedService} 단위 테스트 — #825 슬5 R1 BLOCKING#1 근본 fix 증거.
 *
 * <p>종전에는 {@code type=ALL} + 세 ref 배열 모두 explicit 빈 배열(FE 가 "저장 선택 사용" 의도로
 * 보내는 payload) 요청에서, 저장된 scope 의 refs 가 비어 있으면 그 이유(진짜 '전체' 저장 vs
 * 그냥 미저장)를 따지지 않고 무조건 400 을 던졌다 — ALL 로 저장한 직후 가져오기가
 * 자기모순으로 실패하는 결함(FABLE5 R1 BLOCKING#1). scope_mode 컬럼(V64) 도입 후에는
 * 저장된 scope 의 scopeMode 를 보고 ALL 이면 CODEF 서버 전체 열거로, SELECTED 면 저장된
 * ref 목록으로 해석을 분기한다.
 */
@ExtendWith(MockitoExtension.class)
class CodefImportScopedServiceTest {

    @Mock private CodefClient codefClient;
    @Mock private CodefImportService codefImportService;
    @Mock private UserCodefImportScopeService scopeService;

    @InjectMocks private CodefImportScopedService service;

    private static final UUID USER_ID = UUID.randomUUID();
    private static final String CONNECTED_ID = "connected-main";
    private static final LocalDate FROM = LocalDate.of(2026, 6, 1);
    private static final LocalDate TO = LocalDate.of(2026, 6, 3);

    @Test
    @DisplayName("BLOCKING#1 fix — 저장 scopeMode=ALL 은 refs 가 비어 있어도 400 대신 CODEF 서버 전체 열거로 materialize")
    void allSavedScope_explicitEmptyRefs_materializesFullCodefEnumeration() {
        when(codefClient.listBankAccounts(CONNECTED_ID, "DRY_RUN"))
                .thenReturn(List.of(new AccountInfo("국민 123-456", "운영계좌", "국민은행", "123-456")));
        when(codefClient.listCards(CONNECTED_ID, "DRY_RUN"))
                .thenReturn(List.of(new CardInfo("법인카드-001", "물류카드", "신한카드", "9999")));
        when(codefClient.listLoans(CONNECTED_ID, "DRY_RUN"))
                .thenReturn(List.of(new LoanInfo("기업운전자금대출-001", "운전자금", "하나은행", "운전자금")));
        when(codefImportService.importTransactionsForRefs(
                eq(FROM), eq(TO), eq(CodefImportType.ALL), anyList(), anyList(), anyList(), eq("DRY_RUN")))
                .thenReturn(new CodefImportResponse(3, 3, 0, 0));

        CodefImportResponse response = service.importTransactionsWithScope(
                FROM, TO, CodefImportType.ALL, "ALL", CONNECTED_ID,
                null, null, null, "DRY_RUN", USER_ID);

        assertThat(response.fetchedCount()).isEqualTo(3);
        verify(codefImportService).importTransactionsForRefs(
                FROM, TO, CodefImportType.ALL,
                List.of("국민 123-456"), List.of("법인카드-001"), List.of("기업운전자금대출-001"), "DRY_RUN");
    }

    @Test
    @DisplayName("저장 scopeMode=SELECTED 는 저장된 ref 목록을 그대로 사용한다(CODEF 서버 열거 호출 없음)")
    void selectedSavedScope_explicitEmptyRefs_usesSavedRefs() {
        when(codefImportService.importTransactionsForRefs(
                eq(FROM), eq(TO), eq(CodefImportType.ALL), anyList(), anyList(), anyList(), eq("DRY_RUN")))
                .thenReturn(new CodefImportResponse(1, 1, 0, 0));

        service.importTransactionsWithScope(
                FROM, TO, CodefImportType.ALL, "SELECTED", CONNECTED_ID,
                List.of("하나 987-654321-001"), List.of(), List.of(), "DRY_RUN", USER_ID);

        verify(codefImportService).importTransactionsForRefs(
                FROM, TO, CodefImportType.ALL,
                List.of("하나 987-654321-001"), List.of(), List.of(), "DRY_RUN");
        verify(codefClient, never()).listBankAccounts(any(), any());
        verify(codefClient, never()).listCards(any(), any());
        verify(codefClient, never()).listLoans(any(), any());
    }

    @Test
    @DisplayName("방어 가드 — 저장 scopeMode=SELECTED 인데 refs 가 모두 비어 있으면(정상 저장 경로로는 불가) 여전히 400")
    void selectedSavedScope_corruptedEmptyRefs_stillRejected() {
        // D-S5-02 상 SELECTED+빈 목록은 저장 시점에 400 으로 거부되어 정상 경로로는 도달 불가하지만,
        // 방어적 가드가 여전히 살아있는지 회귀 확인한다.
        assertThatThrownBy(() -> service.importTransactionsWithScope(
                FROM, TO, CodefImportType.ALL, "SELECTED", CONNECTED_ID,
                List.of(), List.of(), List.of(), "DRY_RUN", USER_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("scopeMode=SELECTED");
    }

    /*
     * #825 슬5 R3 HIGH-1 — R2 는 이 분기(:82-86)를 "요청 type" 으로 열거해 저장 당시 카테고리
     * 한정 ALL(예: defaultImportType=CARD·scopeMode=ALL — "카드만 전체")도 BANK+CARD+LOAN
     * 전 카테고리로 조용히 확대했다. 기존 3건은 defaultImportType 이 전부 ALL 이라 "요청 type"과
     * "저장된 scope.getDefaultImportType()" 이 우연히 같은 값이 되어 이 결함을 가리지 못했다
     * (뮤테이션 무방비). 아래 4조합(BANK+ALL·CARD+ALL·LOAN+ALL·ALL+ALL — 라이브 QA R3 표와
     * 동일 매트릭스)은 defaultImportType 값을 요청 type(ALL 고정)과 명시적으로 다르게 만들어,
     * listAllFromCodef 가 요청 type 이 아닌 scope.getDefaultImportType() 을 실제로 읽는지
     * 독립적으로 증명한다 — 다른 두 카테고리의 CodefClient 미호출을 verify(never()) 로 확정.
     */

    @Test
    @DisplayName("R3 HIGH-1 fix — 저장 scopeMode=ALL + defaultImportType=BANK 은 계좌만 전체 열거한다(카드·대출 미호출)")
    void allSavedScope_defaultImportTypeBank_enumeratesOnlyBank() {
        when(codefClient.listBankAccounts(CONNECTED_ID, "DRY_RUN"))
                .thenReturn(List.of(new AccountInfo("국민 123-456", "운영계좌", "국민은행", "123-456")));
        when(codefImportService.importTransactionsForRefs(
                eq(FROM), eq(TO), eq(CodefImportType.BANK), anyList(), anyList(), anyList(), eq("DRY_RUN")))
                .thenReturn(new CodefImportResponse(1, 1, 0, 0));

        service.importTransactionsWithScope(
                FROM, TO, CodefImportType.BANK, "ALL", CONNECTED_ID,
                null, null, null, "DRY_RUN", USER_ID);

        verify(codefImportService).importTransactionsForRefs(
                FROM, TO, CodefImportType.BANK,
                List.of("국민 123-456"), List.of(), List.of(), "DRY_RUN");
        verify(codefClient).listBankAccounts(CONNECTED_ID, "DRY_RUN");
        verify(codefClient, never()).listCards(any(), any());
        verify(codefClient, never()).listLoans(any(), any());
    }

    @Test
    @DisplayName("R3 HIGH-1 fix — 저장 scopeMode=ALL + defaultImportType=CARD 는 카드만 전체 열거한다(계좌·대출 미호출)")
    void allSavedScope_defaultImportTypeCard_enumeratesOnlyCard() {
        when(codefClient.listCards(CONNECTED_ID, "DRY_RUN"))
                .thenReturn(List.of(new CardInfo("법인카드-001", "물류카드", "신한카드", "9999")));
        when(codefImportService.importTransactionsForRefs(
                eq(FROM), eq(TO), eq(CodefImportType.CARD), anyList(), anyList(), anyList(), eq("DRY_RUN")))
                .thenReturn(new CodefImportResponse(1, 1, 0, 0));

        service.importTransactionsWithScope(
                FROM, TO, CodefImportType.CARD, "ALL", CONNECTED_ID,
                null, null, null, "DRY_RUN", USER_ID);

        verify(codefImportService).importTransactionsForRefs(
                FROM, TO, CodefImportType.CARD,
                List.of(), List.of("법인카드-001"), List.of(), "DRY_RUN");
        verify(codefClient).listCards(CONNECTED_ID, "DRY_RUN");
        verify(codefClient, never()).listBankAccounts(any(), any());
        verify(codefClient, never()).listLoans(any(), any());
    }

    @Test
    @DisplayName("R3 HIGH-1 fix — 저장 scopeMode=ALL + defaultImportType=LOAN 은 대출만 전체 열거한다(계좌·카드 미호출)")
    void allSavedScope_defaultImportTypeLoan_enumeratesOnlyLoan() {
        when(codefClient.listLoans(CONNECTED_ID, "DRY_RUN"))
                .thenReturn(List.of(new LoanInfo("기업운전자금대출-001", "운전자금", "하나은행", "운전자금")));
        when(codefImportService.importTransactionsForRefs(
                eq(FROM), eq(TO), eq(CodefImportType.LOAN), anyList(), anyList(), anyList(), eq("DRY_RUN")))
                .thenReturn(new CodefImportResponse(1, 1, 0, 0));

        service.importTransactionsWithScope(
                FROM, TO, CodefImportType.LOAN, "ALL", CONNECTED_ID,
                null, null, null, "DRY_RUN", USER_ID);

        verify(codefImportService).importTransactionsForRefs(
                FROM, TO, CodefImportType.LOAN,
                List.of(), List.of(), List.of("기업운전자금대출-001"), "DRY_RUN");
        verify(codefClient).listLoans(CONNECTED_ID, "DRY_RUN");
        verify(codefClient, never()).listBankAccounts(any(), any());
        verify(codefClient, never()).listCards(any(), any());
    }
}
