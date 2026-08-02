package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 레거시 GAS 일마감의 완성 세트 후보 판정.
 * 구성품 단건의 부모를 임의 선택하지 않고, 현재 invoice pool에서 후보 세트의
 * 실내기·실외기·옵션 구성품과 가격을 모두 소비할 수 있을 때만 후보를 확정한다.
 */
final class LegacySetMatcher {

    Optional<String> findFirstCompleteSet(List<InvoiceLine> pool, List<SetCandidate> candidates) {
        for (SetCandidate candidate : candidates) {
            Set<Integer> used = new HashSet<>();
            boolean complete = true;
            for (Component component : candidate.components()) {
                int index = findUnused(pool, used, component);
                if (index < 0) {
                    complete = false;
                    break;
                }
                used.add(index);
            }
            if (complete) {
                return Optional.of(candidate.setName());
            }
        }
        return Optional.empty();
    }

    private static int findUnused(List<InvoiceLine> pool, Set<Integer> used, Component component) {
        for (int i = 0; i < pool.size(); i++) {
            InvoiceLine line = pool.get(i);
            if (!used.contains(i)
                    && component.kind().equals(line.kind())
                    && component.modelToken().equals(line.modelToken())
                    && samePrice(component.price(), line.unitPrice())) {
                return i;
            }
        }
        return -1;
    }

    private static boolean samePrice(BigDecimal expected, BigDecimal actual) {
        return expected != null && actual != null && expected.compareTo(actual) == 0;
    }

    record InvoiceLine(String modelToken, String kind, BigDecimal unitPrice) {}

    record Component(String modelToken, String kind, BigDecimal price) {}

    record SetCandidate(String setName, List<Component> components) {}
}
