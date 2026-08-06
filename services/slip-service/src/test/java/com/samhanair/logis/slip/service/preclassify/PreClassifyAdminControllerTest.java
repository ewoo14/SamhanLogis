package com.samhanair.logis.slip.service.preclassify;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import com.samhanair.logis.slip.service.preclassify.DispatchExecutionMode;
import com.samhanair.logis.slip.service.preclassify.PreClassifyResponse;
import com.samhanair.logis.slip.web.preclassify.PreClassifyAdminController;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** S2 RED-A: 삼한 admin API가 8개 실행 모드 각각에 응답하는지 검증한다. */
class PreClassifyAdminControllerTest {
    @Test
    void api_returnsResultForEveryExecutionMode() throws Exception {
        PreClassifyService service = mock(PreClassifyService.class);
        when(service.classify(any(LocalDate.class), any(LocalDate.class), any()))
                .thenReturn(new PreClassifyResponse(java.util.Map.of(), List.of(), 0));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new PreClassifyAdminController(service)).build();

        for (DispatchExecutionMode mode : DispatchExecutionMode.values()) {
            mvc.perform(get("/admin/dispatches/pre-classify")
                            .param("from", "2026-08-04")
                            .param("to", "2026-08-04")
                            .param("mode", mode.name()))
                    .andExpect(status().isOk());
        }
    }
}
