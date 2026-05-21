package com.samhanair.logis.inventory.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.inventory.service.EcountWarehouseImporter;
import com.samhanair.logis.inventory.web.dto.EcountWarehouseImportResult;
import java.io.InputStream;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-2 창고 import controller multipart + MASTER/MANAGER 권한 IT. */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
class EcountWarehouseImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountWarehouseImporter importer;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ProductClient productClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private AccountingClient accountingClient;
    @MockBean private NotificationClient notificationClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    void manager_can_upload_warehouse_import_file() throws Exception {
        when(importer.importCsv(any(InputStream.class), anyString()))
                .thenReturn(new EcountWarehouseImportResult(1, 1, 0, 0, 0, "HASH", List.of()));

        mockMvc.perform(multipart("/admin/warehouses/imports/ecount")
                        .file(new MockMultipartFile("file", "sample.csv", "text/csv", "x".getBytes()))
                        .header("X-User-Id", "tester")
                        .header("X-User-Role", "MANAGER")
                        .with(csrf()))
                .andExpect(status().isOk());
    }
}
