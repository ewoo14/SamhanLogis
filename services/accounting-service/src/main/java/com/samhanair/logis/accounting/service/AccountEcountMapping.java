package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 계정과목의 이카운트 정본 표시 정책.
 *
 * <p>이 정책은 원장 라인의 {@code account_code}를 변경하지 않는다. 정찰 보고서와
 * 기존 결정에서 목표 코드가 직접 확인된 두 건만 매핑하고, 업무 의미가 미정인 코드는
 * 숫자를 추정하지 않고 명시적으로 미정으로 반환한다.
 */
public final class AccountEcountMapping {

    /** 개발책임자가 직접 확정한 이카운트 매핑만 보유한다. */
    private static final Map<String, String> CONFIRMED = Map.ofEntries(
            Map.entry("101", "1019"), Map.entry("102", "1039"), Map.entry("110", "1089"),
            Map.entry("142", "2024"), Map.entry("146", "2054"), Map.entry("201", "2519"),
            Map.entry("210", "2539"), Map.entry("220", "2559"), Map.entry("255", "2559"),
            Map.entry("260", "2954"), Map.entry("301", "3329"), Map.entry("343", "3779"),
            Map.entry("401", "4019"), Map.entry("404", "4049"), Map.entry("501", "4511"),
            Map.entry("801", "8029"), Map.entry("814", "8139"), Map.entry("818", "8239"),
            Map.entry("819", "8249"), Map.entry("831", "8319"), Map.entry("901", "9019"),
            Map.entry("919", "9399"), Map.entry("991", "9719"));

    /** 매핑하지 않고 미정으로 표시해야 하는 로컬 코드. */
    private static final Set<String> UNDETERMINED = Set.of(
            "103", "104", "105", "900");

    private AccountEcountMapping() {}

    public enum Status {
        MAPPED,
        UNDETERMINED,
        UNMAPPED
    }

    public record Mapping(String legacyCode, String ecountCode, Status status, String displayLabel) {}

    /** 계정 코드의 정본 표시 결과를 반환한다. */
    public static Mapping resolve(String legacyCode) {
        String ecountCode = CONFIRMED.get(legacyCode);
        if (ecountCode != null) {
            return new Mapping(legacyCode, ecountCode, Status.MAPPED, ecountCode);
        }
        if (UNDETERMINED.contains(legacyCode)) {
            return new Mapping(legacyCode, null, Status.UNDETERMINED, "미정");
        }
        return new Mapping(legacyCode, null, Status.UNMAPPED, "이카운트 원문 없음");
    }

    /**
     * 대표 전표 스냅샷에 표시 매핑만 적용한다.
     *
     * <p>금액과 전표번호는 입력 그대로 복사하며, 이 메서드는 실제 DB를 갱신하지 않는다.
     */
    public static Reconciliation reconcile(List<JournalSnapshot> before) {
        List<JournalSnapshot> after = before.stream()
                .map(line -> {
                    Mapping mapping = resolve(line.accountCode());
                    return new JournalSnapshot(
                            line.journalNo(), mapping.ecountCode() == null ? line.accountCode() : mapping.ecountCode(),
                            line.debit(), line.credit());
                })
                .toList();
        return new Reconciliation(
                after.stream().map(JournalSnapshot::journalNo).distinct().count(),
                after.stream().map(JournalSnapshot::debit).reduce(BigDecimal.ZERO, BigDecimal::add),
                after.stream().map(JournalSnapshot::credit).reduce(BigDecimal.ZERO, BigDecimal::add),
                after);
    }

    public record JournalSnapshot(String journalNo, String accountCode, BigDecimal debit, BigDecimal credit) {}

    public record Reconciliation(long journalCount, BigDecimal debitTotal, BigDecimal creditTotal,
                                 List<JournalSnapshot> lines) {}
}
