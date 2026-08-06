package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * 레거시 GAS 일마감( {@code Code.js:568-659} )의 세트 매칭 규칙.
 * 후보는 실내기별로 구성품 수 내림차순 stable 정렬하고, 필수 실내기·실외기와
 * 실제로 존재하는 옵션만 pool에서 소비한 뒤 납품가 합계와 세트 DC를 비교한다.
 */
final class LegacySetMatcher {

    List<Match> findMatches(List<InvoiceLine> pool,
                            List<SetCandidate> candidates,
                            Map<String, DiscountRevalidator.GlobalDiscount> discountsByPartnerCode) {
        return findMatchesWithUsage(pool, candidates, discountsByPartnerCode).matches();
    }

    MatchingResult findMatchesWithUsage(List<InvoiceLine> pool,
                                        List<SetCandidate> candidates,
                                        Map<String, DiscountRevalidator.GlobalDiscount> discountsByPartnerCode) {
        Map<String, List<SetCandidate>> candidatesByIndoor = new LinkedHashMap<>();
        for (SetCandidate candidate : candidates) {
            candidate.indoorToken().ifPresent(token ->
                    candidatesByIndoor.computeIfAbsent(token, ignored -> new ArrayList<>()).add(candidate));
        }
        candidatesByIndoor.values().forEach(list ->
                list.sort(Comparator.comparingInt((SetCandidate candidate) -> candidate.components().size()).reversed()));

        boolean[] used = new boolean[pool.size()];
        List<Match> matches = new ArrayList<>();
        for (int indoorIndex = 0; indoorIndex < pool.size(); indoorIndex++) {
            InvoiceLine indoor = pool.get(indoorIndex);
            if (used[indoorIndex] || !"INDOOR".equals(indoor.kind())) {
                continue;
            }
            for (SetCandidate candidate : candidatesByIndoor.getOrDefault(indoor.modelToken(), List.of())) {
                Optional<Match> match = tryMatch(pool, used, indoorIndex, indoor, candidate,
                        discountsByPartnerCode == null ? Map.of() : discountsByPartnerCode);
                if (match.isPresent()) {
                    match.get().poolIndexes().forEach(index -> used[index] = true);
                    matches.add(match.get());
                    break;
                }
            }
        }
        Map<String, MutableUsage> usage = new LinkedHashMap<>();
        for (int index = 0; index < pool.size(); index++) {
            String sourceKey = pool.get(index).sourceKey();
            if (sourceKey == null) {
                continue;
            }
            MutableUsage row = usage.computeIfAbsent(sourceKey, ignored -> new MutableUsage());
            row.total++;
            if (used[index]) {
                row.used++;
            }
        }
        Map<String, Usage> snapshot = new LinkedHashMap<>();
        usage.forEach((key, value) -> snapshot.put(key, new Usage(value.total, value.used)));
        return new MatchingResult(matches, snapshot);
    }

    Optional<String> findFirstCompleteSet(List<InvoiceLine> pool, List<SetCandidate> candidates) {
        return findMatches(pool, candidates, Map.of()).stream().findFirst().map(Match::setName);
    }

    private static Optional<Match> tryMatch(List<InvoiceLine> pool,
                                            boolean[] used,
                                            int indoorIndex,
                                            InvoiceLine indoor,
                                            SetCandidate candidate,
                                            Map<String, DiscountRevalidator.GlobalDiscount> discountsByPartnerCode) {
        Component requiredIndoor = candidate.components().stream()
                .filter(component -> "INDOOR".equals(component.kind())
                        && indoor.modelToken().equals(component.modelToken()))
                .findFirst().orElse(null);
        Component requiredOutdoor = candidate.components().stream()
                .filter(component -> "OUTDOOR".equals(component.kind())).findFirst().orElse(null);
        if (requiredIndoor == null || requiredOutdoor == null) {
            return Optional.empty();
        }

        int outdoorIndex = findUnusedByToken(pool, used, requiredOutdoor.modelToken(), "OUTDOOR",
                indoor.scopeKey());
        if (outdoorIndex < 0) {
            return Optional.empty();
        }
        List<Integer> indexes = new ArrayList<>(List.of(indoorIndex, outdoorIndex));
        BigDecimal expected = requiredIndoor.price().add(requiredOutdoor.price());
        for (Component option : candidate.components()) {
            if ("INDOOR".equals(option.kind()) || "OUTDOOR".equals(option.kind())) {
                continue;
            }
            int optionIndex = findUnusedByToken(pool, used, option.modelToken(), null,
                    indoor.scopeKey());
            if (optionIndex >= 0 && !indexes.contains(optionIndex)) {
                indexes.add(optionIndex);
                expected = expected.add(option.price());
            }
        }

        DiscountRevalidator.GlobalDiscount globalDiscount = indoor.partnerCode() == null
                ? DiscountRevalidator.GlobalDiscount.unavailable()
                : discountsByPartnerCode.getOrDefault(
                        indoor.partnerCode(), DiscountRevalidator.GlobalDiscount.unavailable());
        BigDecimal discount = globalDiscount.discountForSet(candidate.setName());
        BigDecimal invoice = indexes.stream().map(index -> pool.get(index).unitPrice())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal finalExpected = expected.subtract(discount.abs());
        if (invoice.abs().compareTo(finalExpected.abs()) != 0) {
            return Optional.empty();
        }
        return Optional.of(new Match(candidate.setName(), indexes));
    }

    private static int findUnusedByToken(List<InvoiceLine> pool, boolean[] used,
                                         String token, String kind, String scopeKey) {
        for (int index = 0; index < pool.size(); index++) {
            InvoiceLine line = pool.get(index);
            if (!used[index] && token.equals(line.modelToken())
                    && (kind == null || kind.equals(line.kind()))
                    && Objects.equals(scopeKey, line.scopeKey())) {
                return index;
            }
        }
        return -1;
    }

    record InvoiceLine(String modelToken, String kind, BigDecimal unitPrice,
                       String partnerCode, String scopeKey, String sourceKey) {
        InvoiceLine(String modelToken, String kind, BigDecimal unitPrice) {
            this(modelToken, kind, unitPrice, null, null, null);
        }

        InvoiceLine(String modelToken, String kind, BigDecimal unitPrice, String partnerCode) {
            this(modelToken, kind, unitPrice, partnerCode, partnerCode, null);
        }

        InvoiceLine(String modelToken, String kind, BigDecimal unitPrice,
                    String partnerCode, String scopeKey) {
            this(modelToken, kind, unitPrice, partnerCode, scopeKey, null);
        }
    }

    record Component(String modelToken, String kind, BigDecimal price) {}

    record SetCandidate(String setName, List<Component> components) {
        Optional<String> indoorToken() {
            return components.stream().filter(component -> "INDOOR".equals(component.kind()))
                    .map(Component::modelToken).findFirst();
        }
    }

    record Match(String setName, List<Integer> poolIndexes) {}

    record MatchingResult(List<Match> matches, Map<String, Usage> usage) {}

    record Usage(int total, int used) {}

    private static final class MutableUsage {
        private int total;
        private int used;
    }
}
