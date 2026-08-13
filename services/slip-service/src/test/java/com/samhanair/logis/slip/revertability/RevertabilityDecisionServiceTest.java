package com.samhanair.logis.slip.revertability;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.web.dto.SlipRevertabilityResponse;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class RevertabilityDecisionServiceTest {

    private final RevertabilityDecisionService service = new RevertabilityDecisionService();

    @Test
    void allThirteenCompletedSlips_areIndividuallyClassified() {
        List<RevertabilityEvidence> evidence = IntStream.rangeClosed(1, 13)
                .mapToObj(i -> new RevertabilityEvidence(
                        "2026/08/%02d-%d".formatted(Math.min(i, 9), i),
                        SlipStatus.COMPLETED,
                        1,
                        0,
                        null))
                .toList();

        List<RevertabilityDecision> decisions = service.evaluateAll(evidence);

        assertThat(decisions).hasSize(13);
        assertThat(decisions).allSatisfy(decision -> {
            assertThat(decision.revertable()).isFalse();
            assertThat(decision.reasonCodes()).contains(RevertabilityReason.LEGACY_NO_SOURCE_JOURNAL);
        });
    }

    @Test
    void evaluatingDoesNotChangeCompletedStatus() {
        RevertabilityEvidence evidence = new RevertabilityEvidence(
                "2026/08/03-4", SlipStatus.COMPLETED, 1, 0, null);

        RevertabilityDecision decision = service.evaluate(evidence);

        assertThat(evidence.status()).isEqualTo(SlipStatus.COMPLETED);
        assertThat(decision.revertable()).isFalse();
    }

    @Test
    void activeDispatchGroupIsAVisibleBlockerWithoutUuid() {
        RevertabilityEvidence evidence = new RevertabilityEvidence(
                "2026/08/03-4", SlipStatus.COMPLETED, 1, 0, "QA-1039-GROUP-S9");

        RevertabilityDecision decision = service.evaluate(evidence);

        assertThat(decision.reasonCodes()).contains(
                RevertabilityReason.LEGACY_NO_SOURCE_JOURNAL,
                RevertabilityReason.DOWNSTREAM_DISPATCH_GROUP);
        assertThat(decision.reasons()).anyMatch(reason -> reason.contains("QA-1039-GROUP-S9"));
        String json;
        try {
            json = new ObjectMapper().writeValueAsString(SlipRevertabilityResponse.from(decision));
        } catch (Exception ex) {
            throw new AssertionError(ex);
        }
        assertThat(json).doesNotContain(UUID.randomUUID().toString());
        assertThat(json).doesNotContain("\"id\"");
        assertThat(decision.userVisibleText()).doesNotContain("dispatchGroupId");
    }
}
