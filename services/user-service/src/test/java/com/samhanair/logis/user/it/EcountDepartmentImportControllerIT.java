package com.samhanair.logis.user.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.user.UserServiceApplication;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.user.service.EcountDepartmentImporter;
import com.samhanair.logis.user.web.dto.EcountDepartmentImportResult;
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

/** MIG-2 부서 import controller multipart + MASTER/MANAGER 권한 IT. */
@SpringBootTest(classes = UserServiceApplication.class)
@AutoConfigureMockMvc
class EcountDepartmentImportControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private EcountDepartmentImporter importer;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private AuthClient authClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    @WithMockUser(authorities = "ROLE_MASTER")
    void master_can_upload_department_import_file() throws Exception {
        when(importer.importCsv(any(InputStream.class), anyString()))
                .thenReturn(new EcountDepartmentImportResult(1, 1, 0, 0, 0, "HASH", List.of()));

        mockMvc.perform(multipart("/admin/departments/imports/ecount")
                        .file(new MockMultipartFile("file", "sample.csv", "text/csv", "x".getBytes()))
                        .header("X-User-Id", "tester")
                        .header("X-User-Role", "MASTER")
                        .with(csrf()))
                .andExpect(status().isOk());
    }
}
