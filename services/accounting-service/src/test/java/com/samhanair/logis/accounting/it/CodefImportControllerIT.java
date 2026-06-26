package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.repository.BankTransactionRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/**
 * CODEF 은행·카드 거래내역 import 통합 테스트 (BC1).
 *
 * <p>실 PostgreSQL + Flyway 기반으로 CODEF DRY_RUN client, BankTransaction 적재,
 * externalRef 멱등, 카드 필드, 거래처 자동 매칭을 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CodefImportControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/codef/import";
    private static final UUID PARTNER_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private BankTransactionRepository bankTransactionRepository;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM bank_transaction");
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any())).thenReturn(Map.of());
        lenient().when(partnerLookupClient.findByPartnerCode(anyString())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode("(주)삼성상사"))
                .thenReturn(Optional.of(new PartnerSummary(
                        PARTNER_ID,
                        "SS-001",
                        "(주)삼성상사",
                        "123-45-67890",
                        "서울")));
    }

    @Test
    @DisplayName("CODEF DRY_RUN 은행+카드 10건 적재, 재호출 externalRef 멱등, 거래처 매칭")
    void importCodefDryRun_idempotentAndMatchesPartner() throws Exception {
        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(10))
                .andExpect(jsonPath("$.data.importedCount").value(10))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0))
                .andExpect(jsonPath("$.data.matchedCount").value(1));

        importCodef()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(10))
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(10))
                .andExpect(jsonPath("$.data.matchedCount").value(0));

        Integer bankCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_BANK'
                """, Integer.class);
        Integer cardCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_CARD'
                   AND txn_type = 'WITHDRAWAL'
                   AND card_name IS NOT NULL
                   AND approval_id IS NOT NULL
                """, Integer.class);

        assertThat(bankCount).isEqualTo(5);
        assertThat(cardCount).isEqualTo(5);
        assertThat(bankTransactionRepository.findByExternalRefAndIsDeletedFalse("CODEF-BANK-2026-06-01-001"))
                .hasValueSatisfying(txn -> assertThat(txn.getMatchedPartnerId()).isEqualTo(PARTNER_ID));
    }

    @Test
    @DisplayName("CODEF DRY_RUN 대출 5건 적재, 재호출 externalRef 멱등")
    void importCodefLoanDryRun_idempotent() throws Exception {
        importCodefLoan()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(5))
                .andExpect(jsonPath("$.data.importedCount").value(5))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(0))
                .andExpect(jsonPath("$.data.matchedCount").value(0));

        importCodefLoan()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fetchedCount").value(5))
                .andExpect(jsonPath("$.data.importedCount").value(0))
                .andExpect(jsonPath("$.data.duplicateSkippedCount").value(5))
                .andExpect(jsonPath("$.data.matchedCount").value(0));

        Integer loanCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM bank_transaction
                 WHERE source = 'CODEF_LOAN'
                   AND loan_name = '기업운전자금대출'
                   AND bank_account_label = '기업운전자금대출-001'
                """, Integer.class);

        assertThat(loanCount).isEqualTo(5);
    }

    private org.springframework.test.web.servlet.ResultActions importCodef() throws Exception {
        return mockMvc.perform(post(BASE_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "from": "2026-06-01",
                          "to": "2026-06-03",
                          "accountRef": "국민 123-456",
                          "cardRef": "법인카드-001",
                          "submitMethod": "DRY_RUN"
                        }
                        """)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }

    private org.springframework.test.web.servlet.ResultActions importCodefLoan() throws Exception {
        return mockMvc.perform(post(BASE_URL)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "from": "2026-06-01",
                          "to": "2026-06-03",
                          "type": "LOAN",
                          "loanRef": "기업운전자금대출-001",
                          "submitMethod": "DRY_RUN"
                        }
                        """)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT"));
    }
}
