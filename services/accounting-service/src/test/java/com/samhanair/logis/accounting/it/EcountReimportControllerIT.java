package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.EcountReimportService;
import com.samhanair.logis.common.ecount.EcountReimportResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** MIG-20 이카운트 raw 재import endpoint 권한/오류/멱등 계약 IT. */
@SpringBootTest(
        classes = AccountingServiceApplication.class,
        properties = {
                "spring.datasource.url=jdbc:h2:mem:ecount_reimport_it;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "spring.flyway.enabled=false",
                "spring.jpa.hibernate.ddl-auto=none",
                "eureka.client.enabled=false",
                "eureka.client.register-with-eureka=false",
                "eureka.client.fetch-registry=false",
                "app.security.internal.token=test-internal-token"
        })
@AutoConfigureMockMvc
@Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
class EcountReimportControllerIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String PAGE_CODE = "ecount.reimport";

    @Autowired private MockMvc mockMvc;

    @MockBean private EcountReimportService reimportService;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    @Test
    @WithMockUser(authorities = "ROLE_MASTER")
    @DisplayName("정상: MASTER + ecount.reimport EDIT 권한이면 slice 재import 결과를 반환한다")
    void masterCanRunReimport() throws Exception {
        when(reimportService.reimportSlice("mig-3", "00000000-0000-0000-0000-000000000115")).thenReturn(result("mig-3", 4, 2, 2, 10, 1));

        mockMvc.perform(post("/admin/ecount/reimport/mig-3")
                        .header(USER_ID_HEADER, "00000000-0000-0000-0000-000000000115")
                        .header(ROLE_HEADER, "MASTER")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slice").value("mig-3"))
                .andExpect(jsonPath("$.filesScanned").value(4))
                .andExpect(jsonPath("$.filesProcessed").value(2))
                .andExpect(jsonPath("$.filesSkipped").value(2))
                .andExpect(jsonPath("$.totalImported").value(10))
                .andExpect(jsonPath("$.totalRejected").value(1));

        verify(dynamicPermissionClient, atLeastOnce()).canEdit("MASTER", PAGE_CODE);
    }

    @Test
    @WithMockUser(authorities = "ROLE_MASTER")
    @DisplayName("slice가 mig-1~mig-11 범위를 벗어나면 422를 반환한다")
    void unknownSliceReturns422() throws Exception {
        when(reimportService.reimportSlice("mig-99", "00000000-0000-0000-0000-000000000115"))
                .thenThrow(new BusinessException(ErrorCode.MIG20_SLICE_UNKNOWN, "MIG20_SLICE_UNKNOWN: mig-99"));

        mockMvc.perform(post("/admin/ecount/reimport/mig-99")
                        .header(USER_ID_HEADER, "00000000-0000-0000-0000-000000000115")
                        .header(ROLE_HEADER, "MASTER")
                        .with(csrf()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("MIG20_SLICE_UNKNOWN"));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MASTER")
    @DisplayName("동적 EDIT 권한이 없으면 MASTER라도 403으로 차단한다")
    void dynamicEditDeniedReturns403() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(PAGE_CODE), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit("MASTER", PAGE_CODE)).thenReturn(false);

        mockMvc.perform(post("/admin/ecount/reimport/mig-3")
                        .header(USER_ID_HEADER, "00000000-0000-0000-0000-000000000115")
                        .header(ROLE_HEADER, "MASTER")
                        .with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MASTER")
    @DisplayName("raw 디렉토리가 비어 있으면 0건 결과를 반환한다")
    void emptyRawDirectoryReturnsZeroResult() throws Exception {
        when(reimportService.reimportSlice("mig-11", "00000000-0000-0000-0000-000000000115")).thenReturn(result("mig-11", 0, 0, 0, 0, 0));

        mockMvc.perform(post("/admin/ecount/reimport/mig-11")
                        .header(USER_ID_HEADER, "00000000-0000-0000-0000-000000000115")
                        .header(ROLE_HEADER, "MASTER")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.filesScanned").value(0))
                .andExpect(jsonPath("$.filesProcessed").value(0))
                .andExpect(jsonPath("$.filesSkipped").value(0));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MASTER")
    @DisplayName("이미 처리된 source_file_hash는 processed=0 skipped=N으로 보고한다")
    void idempotentFilesAreSkipped() throws Exception {
        when(reimportService.reimportSlice("mig-4", "00000000-0000-0000-0000-000000000115")).thenReturn(result("mig-4", 3, 0, 3, 0, 0));

        mockMvc.perform(post("/admin/ecount/reimport/mig-4")
                        .header(USER_ID_HEADER, "00000000-0000-0000-0000-000000000115")
                        .header(ROLE_HEADER, "MASTER")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.filesScanned").value(3))
                .andExpect(jsonPath("$.filesProcessed").value(0))
                .andExpect(jsonPath("$.filesSkipped").value(3));
    }

    @Test
    @WithMockUser(authorities = "ROLE_MANAGER")
    @DisplayName("동적 EDIT 권한이 없으면 MANAGER도 403으로 차단한다")
    void managerIsForbidden() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(PAGE_CODE), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit("MANAGER", PAGE_CODE)).thenReturn(false);

        mockMvc.perform(post("/admin/ecount/reimport/mig-3")
                        .header(USER_ID_HEADER, "00000000-0000-0000-0000-000000000115")
                        .header(ROLE_HEADER, "MANAGER")
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }

    private static EcountReimportResult result(String slice, int scanned, int processed,
                                               int skipped, int imported, int rejected) {
        return new EcountReimportResult(slice, scanned, processed, skipped, imported, rejected,
                List.of(), List.of());
    }
}
