package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class CodefImportScopeResponseSerializationTest {

    @Test
    void unsavedScopeKeepsExplicitNullScopeModeEvenWithNonNullMapperDefaults() throws Exception {
        ObjectMapper mapper = new ObjectMapper()
                .setSerializationInclusion(JsonInclude.Include.NON_NULL);

        String json = mapper.writeValueAsString(CodefImportScopeResponse.empty("connected-main"));

        assertThat(json).contains("\"scopeMode\":null");
    }
}
