package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.service.JournalService;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** accounting-service 내부 분개 생성 endpoint 인증/계약 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
class AccountingInternalJournalControllerIT extends AbstractPostgresIT {

    private static final String URL = "/internal/accounting/journals";
    private static final String TOKEN = "test-internal-token";

    @Autowired private MockMvc mockMvc;

    @MockBean private JournalService journalService;

    @BeforeEach
    void setUpJournalService() {
        JournalDetailResponse response = new JournalDetailResponse(
                UUID.fromString("00000000-0000-0000-0000-000000000531"),
                "J-20260629-001",
                LocalDate.of(2026, 6, 29),
                "inventory audit",
                JournalSourceType.MANUAL,
                JournalStatus.DRAFT,
                new BigDecimal("1000"),
                new BigDecimal("1000"),
                null,
                null,
                null,
                null,
                null,
                null,
                List.of());
        doReturn(response).when(journalService).createInventoryAuditAdjustment(any(CreateJournalRequest.class));
    }

    @Test
    void create_with_valid_internal_token_returns_201_and_reuses_journal_service() throws Exception {
        mockMvc.perform(post(URL)
                        .header("X-Internal-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "journalDate": "2026-06-29",
                                  "description": "inventory audit",
                                  "lines": [
                                    {"accountCode":"1462","debitAmount":1000,"creditAmount":0},
                                    {"accountCode":"9399","debitAmount":0,"creditAmount":1000}
                                  ]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.journalNo").value("J-20260629-001"));

        verify(journalService).createInventoryAuditAdjustment(any(CreateJournalRequest.class));
    }

    @Test
    void create_without_internal_token_returns_401() throws Exception {
        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void create_with_invalid_internal_token_returns_401() throws Exception {
        mockMvc.perform(post(URL)
                        .header("X-Internal-Token", "wrong-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
