package com.samhanair.logis.product.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.product.service.EcountProductImporter;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import java.io.InputStream;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-2 품목 import controller multipart + MASTER/MANAGER 권한 IT. */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
class EcountProductImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EcountProductImporter importer;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @WithMockUser(authorities = "ROLE_MASTER")
    void master_can_upload_product_import_files() throws Exception {
        Mockito.lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
        when(importer.importCsv(any(InputStream.class), any(InputStream.class), any(InputStream.class), anyString()))
                .thenReturn(new EcountProductImportResult(1, 1, 0, 0, 0, 0, 1, "HASH", List.of(), 0, List.of()));

        mockMvc.perform(multipart("/admin/products/imports/ecount")
                        .file(file("itemFile"))
                        .file(file("relationFile"))
                        .file(file("groupFile"))
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000105")
                        .header("X-User-Role", "MASTER")
                        .with(csrf()))
                .andExpect(status().isOk());
    }

    private static MockMultipartFile file(String name) {
        return new MockMultipartFile(name, "sample.csv", "text/csv", "x".getBytes());
    }
}
