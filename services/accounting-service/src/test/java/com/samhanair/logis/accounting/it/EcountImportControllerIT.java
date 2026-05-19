package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.EcountAccountImporter;
import com.samhanair.logis.accounting.service.EcountCardImporter;
import com.samhanair.logis.accounting.web.dto.EcountAccountImportResult;
import com.samhanair.logis.accounting.web.dto.EcountCardImportResult;
import java.io.InputStream;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-2 계정/카드 import controller multipart + MASTER/MANAGER 권한 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class EcountImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountAccountImporter accountImporter;
    @MockBean private EcountCardImporter cardImporter;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_account_import_file() throws Exception {
        when(accountImporter.importCsv(any(InputStream.class), anyString()))
                .thenReturn(new EcountAccountImportResult(1, 1, 0, 0, 0, "HASH", List.of()));

        mockMvc.perform(multipart("/admin/accounts/imports/ecount")
                        .file(file())
                        .header("X-User-Id", "tester")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_card_import_file() throws Exception {
        when(cardImporter.importCsv(any(InputStream.class), anyString()))
                .thenReturn(new EcountCardImportResult(1, 1, 0, 0, 0, "HASH", List.of()));

        mockMvc.perform(multipart("/admin/cards/imports/ecount")
                        .file(file())
                        .header("X-User-Id", "tester")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isOk());
    }

    private static MockMultipartFile file() {
        return new MockMultipartFile("file", "sample.csv", "text/csv", "x".getBytes());
    }
}
