package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** S27-1123 전표 변경 endpoint가 날짜 가드를 호출하는지 고정한다. */
class S27MutationPathContractTest {

    private static final Path ROOT = Path.of("src/main/java/com/samhanair/logis/slip");

    @Test
    void everyDirectMutationServiceCallsClosedDateGuard() throws Exception {
        List<String> files = List.of(
                "service/SlipUpdateService.java",
                "service/SalesSlipUpdateService.java",
                "service/SlipDeleteService.java",
                "service/SalesSlipDeleteService.java");

        for (String file : files) {
            String source = Files.readString(ROOT.resolve(file), StandardCharsets.UTF_8);
            assertThat(source)
                    .as("S27-1123 %s must enforce the closed-date rule", file)
                    .contains("closedDateGuard.assertAllowed");
        }
    }

    @Test
    void everySlipServiceMutationUsesClosedDateGuard() throws Exception {
        String source = Files.readString(
                ROOT.resolve("service/SlipService.java"), StandardCharsets.UTF_8);
        for (String method : List.of(
                "editHeader", "editDriver", "updateSlip", "addLine", "removeLine",
                "applyOverlayPatch", "applyOverlayPatchBatch", "softDelete")) {
            int methodStart = source.indexOf(" " + method + "(");
            assertThat(methodStart).as("method %s exists", method).isGreaterThanOrEqualTo(0);
            int nextMethod = source.indexOf("\n    public ", methodStart + 1);
            String body = source.substring(methodStart, nextMethod < 0 ? source.length() : nextMethod);
            assertThat(body)
                    .as("S27-1123 mutation %s must enforce the closed-date rule", method)
                    .contains("closedDateGuard.assertAllowed");
        }
    }
}
