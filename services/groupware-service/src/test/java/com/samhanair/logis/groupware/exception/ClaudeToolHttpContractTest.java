package com.samhanair.logis.groupware.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.groupware.claude.UnknownClaudeToolException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class ClaudeToolHttpContractTest {
    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ToolProbeController())
            .setControllerAdvice(new GroupwareExceptionHandler()).build();

    @Test
    void unknownToolIsExplicitNotFoundWithoutAllowlistDetails() throws Exception {
        var response = mockMvc.perform(get("/admin/groupware/claude-tools/not-registered"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(404);
        assertThat(response.getContentAsString()).contains("\"code\":\"NOT_FOUND\"")
                .doesNotContain("groupware.approval-list");
    }

    @Test
    void writeMethodOnReadOnlyToolIsExplicitMethodNotAllowed() throws Exception {
        var response = mockMvc.perform(post("/admin/groupware/claude-tools/approval-list")
                        .contentType(MediaType.APPLICATION_JSON))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(405);
        assertThat(response.getContentAsString()).contains("\"code\":\"METHOD_NOT_ALLOWED\"")
                .doesNotContain("groupware.approval-list");
    }

    @RestController
    @RequestMapping("/admin/groupware/claude-tools")
    static class ToolProbeController {
        @GetMapping("/not-registered")
        void unknown() { throw new UnknownClaudeToolException("hidden-name"); }

        @GetMapping("/approval-list")
        void approvalList() { }
    }
}
