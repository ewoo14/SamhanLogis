package com.samhanair.logis.common.ecount;

import java.util.List;

/** MIG-10 Order.manager_name -> Employee cross-link 결과. UUID 없이 주문번호/담당자명만 노출한다. */
public record EcountMig10Result(
        int totalRows,
        int backfilled,
        int lookupMissCount,
        int ambiguousCount,
        List<Sample> samples) {

    public record Sample(int rowNumber, String level, String code, String message,
                         String businessKey, String rawValue) {
    }

    public static Builder builder(int totalRows) {
        return new Builder(totalRows);
    }

    public static final class Builder {
        private final int totalRows;
        private int backfilled;
        private int lookupMissCount;
        private int ambiguousCount;
        private final java.util.ArrayList<Sample> samples = new java.util.ArrayList<>();

        private Builder(int totalRows) {
            this.totalRows = totalRows;
        }

        public void backfilled() {
            backfilled++;
        }

        public void lookupMiss(int rowNumber, String message, String businessKey, String rawValue) {
            lookupMissCount++;
            sample(rowNumber, "WARN", "MIG10_EMPLOYEE_LOOKUP_MISS", message, businessKey, rawValue);
        }

        public void ambiguous(int rowNumber, String message, String businessKey, String rawValue) {
            ambiguousCount++;
            sample(rowNumber, "WARN", "MIG10_EMPLOYEE_AMBIGUOUS", message, businessKey, rawValue);
        }

        public EcountMig10Result build() {
            return new EcountMig10Result(totalRows, backfilled, lookupMissCount, ambiguousCount,
                    List.copyOf(samples));
        }

        private void sample(int rowNumber, String level, String code, String message,
                            String businessKey, String rawValue) {
            if (samples.size() < 20) {
                samples.add(new Sample(rowNumber, level, code, message, businessKey, rawValue));
            }
        }
    }
}
