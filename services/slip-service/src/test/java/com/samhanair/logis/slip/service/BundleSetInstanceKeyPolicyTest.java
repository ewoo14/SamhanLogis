package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BundleSetInstanceKeyPolicyTest {

    private record TestLine(String parent, boolean head, String model, BundleSetOptions options) {
    }

    @Test
    @DisplayName("R14 RED-A: 교차 배치된 keyless 인스턴스는 signature로 child 소속을 복원한다")
    void materializesCrossedRowsBySignatureInsteadOfRowOrder() {
        BundleSetOptions optionA = options("REMOTE-A");
        BundleSetOptions optionB = options("REMOTE-B");
        List<TestLine> crossed = List.of(
                line(true, "head-A", optionA),
                line(true, "head-B", optionB),
                line(false, "child-A", optionA),
                line(false, "child-B", optionB));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(crossed, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized.get(0).instanceKey()).isNotBlank();
        assertThat(materialized.get(0).instanceKey()).isEqualTo(materialized.get(2).instanceKey());
        assertThat(materialized.get(1).instanceKey()).isNotBlank();
        assertThat(materialized.get(1).instanceKey()).isEqualTo(materialized.get(3).instanceKey());
        assertThat(materialized.get(0).instanceKey()).isNotEqualTo(materialized.get(1).instanceKey());
    }

    @Test
    @DisplayName("R14: 중복 signature는 잘못된 키를 만들지 않고 keyless 복원을 허용한다")
    void preservesAmbiguousDuplicateSignaturesAsKeyless() {
        BundleSetOptions duplicate = options("REMOTE-SAME");
        List<TestLine> crossed = List.of(
                line(true, "head-A", duplicate),
                line(true, "head-B", duplicate),
                line(false, "child-A", duplicate),
                line(false, "child-B", duplicate));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(crossed, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized).containsExactly(duplicate, duplicate, duplicate, duplicate);
        assertThat(materialized).allMatch(options -> options.instanceKey() == null);
    }

    @Test
    @DisplayName("R14 조합: head가 뒤에 와도 signature가 고유하면 child를 정확히 매칭한다")
    void matchesHeadAfterChildrenWithoutUsingRowOrder() {
        BundleSetOptions optionA = options("REMOTE-A");
        BundleSetOptions optionB = options("REMOTE-B");
        List<TestLine> rows = List.of(
                line(false, "child-A", optionA),
                line(false, "child-B", optionB),
                line(true, "head-A", optionA),
                line(true, "head-B", optionB));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(rows, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized.get(0).instanceKey()).isEqualTo(materialized.get(2).instanceKey());
        assertThat(materialized.get(1).instanceKey()).isEqualTo(materialized.get(3).instanceKey());
        assertThat(materialized.get(0).instanceKey()).isNotEqualTo(materialized.get(1).instanceKey());
    }

    @Test
    @DisplayName("R14 조합: 3개 인스턴스가 교차되고 구성품 수가 달라도 signature로 매칭한다")
    void matchesThreeInterleavedInstancesWithDifferentChildCounts() {
        BundleSetOptions optionA = options("REMOTE-A");
        BundleSetOptions optionB = options("REMOTE-B");
        BundleSetOptions optionC = options("REMOTE-C");
        List<TestLine> rows = List.of(
                line(true, "head-A", optionA), line(true, "head-B", optionB),
                line(false, "child-A-1", optionA), line(true, "head-C", optionC),
                line(false, "child-B-1", optionB), line(false, "child-C-1", optionC),
                line(false, "child-A-2", optionA));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(rows, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized.get(0).instanceKey()).isEqualTo(materialized.get(2).instanceKey());
        assertThat(materialized.get(0).instanceKey()).isEqualTo(materialized.get(6).instanceKey());
        assertThat(materialized.get(1).instanceKey()).isEqualTo(materialized.get(4).instanceKey());
        assertThat(materialized.get(3).instanceKey()).isEqualTo(materialized.get(5).instanceKey());
        assertThat(List.of(materialized.get(0).instanceKey(), materialized.get(1).instanceKey(),
                materialized.get(3).instanceKey())).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("R14 조합: 서로 다른 parent가 끼어도 parent별 signature 매칭을 독립 수행한다")
    void matchesInterleavedParentsIndependently() {
        BundleSetOptions optionA = options("REMOTE-A");
        BundleSetOptions optionB = options("REMOTE-B");
        List<TestLine> rows = List.of(
                new TestLine("SET-A", true, "head-A1", optionA),
                new TestLine("SET-B", true, "head-B1", optionA),
                new TestLine("SET-A", true, "head-A2", optionB),
                new TestLine("SET-B", true, "head-B2", optionB),
                new TestLine("SET-A", false, "child-A1", optionA),
                new TestLine("SET-B", false, "child-B2", optionB),
                new TestLine("SET-A", false, "child-A2", optionB),
                new TestLine("SET-B", false, "child-B1", optionA));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(rows, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized.get(0).instanceKey()).isEqualTo(materialized.get(4).instanceKey());
        assertThat(materialized.get(2).instanceKey()).isEqualTo(materialized.get(6).instanceKey());
        assertThat(materialized.get(1).instanceKey()).isEqualTo(materialized.get(7).instanceKey());
        assertThat(materialized.get(3).instanceKey()).isEqualTo(materialized.get(5).instanceKey());
    }

    @Test
    @DisplayName("R14 조합: head가 없는 legacy child는 소속을 추정하지 않고 keyless를 보존한다")
    void preservesHeadlessChildrenWithoutInventingInstanceKeys() {
        BundleSetOptions optionA = options("REMOTE-A");
        List<TestLine> rows = List.of(
                line(false, "child-A", optionA), line(false, "child-A-2", optionA));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(rows, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized).containsExactly(optionA, optionA);
        assertThat(materialized).allMatch(options -> options.instanceKey() == null);
    }

    @Test
    @DisplayName("R14 조합: keyed와 keyless가 섞여도 기존 key는 그대로 보존한다")
    void preservesKeyedRowsAlongsideSignatureMaterializedKeylessRows() {
        BundleSetOptions keyed = new BundleSetOptions("REMOTE-KEYED", false, null, null, false,
                "existing-key");
        BundleSetOptions optionA = options("REMOTE-A");
        BundleSetOptions optionB = options("REMOTE-B");
        List<TestLine> rows = List.of(
                new TestLine("SET-SAME", false, "keyed-child", keyed),
                line(true, "head-A", optionA), line(true, "head-B", optionB),
                line(false, "child-A", optionA), line(false, "child-B", optionB));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(rows, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized.get(0)).isSameAs(keyed);
        assertThat(materialized.get(1).instanceKey()).isEqualTo(materialized.get(3).instanceKey());
        assertThat(materialized.get(2).instanceKey()).isEqualTo(materialized.get(4).instanceKey());
        assertThat(materialized.get(1).instanceKey()).isNotEqualTo(materialized.get(2).instanceKey());
    }

    @Test
    @DisplayName("R14: child signature가 어떤 head와도 맞지 않으면 복원용 key를 만들지 않는다")
    void preservesAllKeylessRowsWhenChildSignatureIsUnmatched() {
        BundleSetOptions optionA = options("REMOTE-A");
        BundleSetOptions optionB = options("REMOTE-B");
        BundleSetOptions unknown = options("REMOTE-UNKNOWN");
        List<TestLine> rows = List.of(
                line(true, "head-A", optionA), line(true, "head-B", optionB),
                line(false, "child-unknown", unknown));

        List<BundleSetOptions> materialized = BundleSetInstanceKeyPolicy
                .materializeLegacyMultiInstanceKeys(rows, TestLine::parent,
                        TestLine::head, TestLine::options);

        assertThat(materialized).containsExactly(optionA, optionB, unknown);
        assertThat(materialized).allMatch(options -> options.instanceKey() == null);
    }

    private static TestLine line(boolean head, String model, BundleSetOptions options) {
        return line("SET-SAME", head, model, options);
    }

    private static TestLine line(String parent, boolean head, String model, BundleSetOptions options) {
        return new TestLine(parent, head, model, options);
    }

    private static BundleSetOptions options(String remoteOption) {
        return new BundleSetOptions(remoteOption, false, null, null, false);
    }
}
