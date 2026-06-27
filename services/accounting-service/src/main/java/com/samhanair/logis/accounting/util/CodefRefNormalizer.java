package com.samhanair.logis.accounting.util;

import java.util.LinkedHashSet;
import java.util.List;

/** CODEF 계좌·카드·대출 ref 배열을 저장/조회/import 경로에서 동일하게 정규화한다. */
public final class CodefRefNormalizer {

    private CodefRefNormalizer() {
    }

    public static List<String> normalizeRefs(List<String> refs) {
        if (refs == null || refs.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String ref : refs) {
            if (ref != null && !ref.isBlank()) {
                normalized.add(ref.trim());
            }
        }
        return List.copyOf(normalized);
    }
}
