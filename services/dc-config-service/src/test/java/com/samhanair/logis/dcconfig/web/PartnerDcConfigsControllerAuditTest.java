package com.samhanair.logis.dcconfig.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.audit.service.DcConfigAuditLogService;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.service.DcConfigService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class PartnerDcConfigsControllerAuditTest {

    private final DcConfigService dcConfigService = org.mockito.Mockito.mock(DcConfigService.class);
    private final DcConfigAuditLogService auditLogService = org.mockito.Mockito.mock(DcConfigAuditLogService.class);
    private final MockMvc mockMvc;

    PartnerDcConfigsControllerAuditTest() {
        DcConfig config = org.mockito.Mockito.mock(DcConfig.class);
        org.mockito.Mockito.when(config.getId()).thenReturn(UUID.randomUUID());
        org.mockito.Mockito.when(dcConfigService.getByPartnerCode("BIZ-1")).thenReturn(config);
        org.mockito.Mockito.when(auditLogService.listByEntity(org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.List.of());
        mockMvc = MockMvcBuilders.standaloneSetup(new PartnerDcConfigsController(
                org.mockito.Mockito.mock(DcConfigRepository.class), dcConfigService, auditLogService)).build();
    }

    @Test
    void auditLogsEndpointIsAvailableOnPartnerDcConfigPath() throws Exception {
        mockMvc.perform(get("/api/v1/partner-dc-configs/BIZ-1/audit-logs"))
                .andExpect(status().isOk());
    }
}
