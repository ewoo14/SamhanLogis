package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 서버 BUNDLE 전개 한 건에 저장할 인스턴스 키를 보장한다. */
public final class BundleSetInstanceKeyPolicy {

    private static final Logger log = LoggerFactory.getLogger(BundleSetInstanceKeyPolicy.class);

    private BundleSetInstanceKeyPolicy() {
    }

    /**
     * 명시된 키는 그대로 보존하고, 키가 없거나 공백이면 기존 5개 옵션을 유지한 새 옵션을 반환한다.
     *
     * @param options 클라이언트가 보낸 BUNDLE 옵션
     * @return 비어 있지 않은 인스턴스 키를 가진 저장용 옵션
     */
    public static BundleSetOptions ensure(BundleSetOptions options) {
        if (hasInstanceKey(options)) {
            return options;
        }
        return withInstanceKey(options, UUID.randomUUID().toString());
    }

    /** 기존 옵션을 유지한 채 지정한 인스턴스 키만 부여한다. */
    public static BundleSetOptions withInstanceKey(BundleSetOptions options, String instanceKey) {
        return new BundleSetOptions(
                options == null ? null : options.remoteOption(),
                options == null ? null : options.remoteExcluded(),
                options == null ? null : options.panelOption(),
                options == null ? null : options.panelShape360(),
                options == null ? null : options.materialIncluded(),
                instanceKey);
    }

    /**
     * 레거시 revision 복원용 BUNDLE 경계를 현재 편집 계약으로 승격한다.
     *
     * <p>동일 parentSetModel의 keyless head가 둘 이상이면 행 순서가 아니라 각 행의 기존
     * 5개 비-key 옵션 signature로 head와 child를 매칭한다. head signature가 중복되거나
     * child가 어느 head signature에도 맞지 않으면 잘못된 키를 만들지 않고 해당 parent의
     * keyless 옵션을 그대로 보존한다. 복원 자체는 계속되며, 운영자가 후속 조치를 찾을 수
     * 있도록 경고를 남긴다. 단일 keyless 인스턴스·head 없는 legacy child·이미 키가 있는
     * 라인은 하위호환을 위해 그대로 보존한다.
     */
    public static <T> List<BundleSetOptions> materializeLegacyMultiInstanceKeys(
            List<T> lines, Function<T, String> parentSetModel,
            Predicate<T> setHead, Function<T, BundleSetOptions> options) {
        if (lines == null || lines.isEmpty()) {
            return List.of();
        }
        Map<String, List<Integer>> keylessHeadIndexesByParent = new HashMap<>();
        Map<String, List<Integer>> keylessIndexesByParent = new HashMap<>();
        for (int index = 0; index < lines.size(); index++) {
            T line = lines.get(index);
            String parent = normalizedParent(parentSetModel.apply(line));
            BundleSetOptions lineOptions = options.apply(line);
            if (parent == null || hasInstanceKey(lineOptions)) {
                continue;
            }
            keylessIndexesByParent.computeIfAbsent(parent, ignored -> new ArrayList<>()).add(index);
            if (setHead.test(line)) {
                keylessHeadIndexesByParent.computeIfAbsent(parent, ignored -> new ArrayList<>())
                        .add(index);
            }
        }

        Map<Integer, String> keysByLineIndex = new HashMap<>();
        for (Map.Entry<String, List<Integer>> entry : keylessHeadIndexesByParent.entrySet()) {
            String parent = entry.getKey();
            List<Integer> headIndexes = entry.getValue();
            if (headIndexes.size() < 2) {
                continue;
            }

            Map<OptionSignature, List<Integer>> headIndexesBySignature = new HashMap<>();
            for (Integer index : headIndexes) {
                headIndexesBySignature.computeIfAbsent(
                        OptionSignature.from(options.apply(lines.get(index))),
                        ignored -> new ArrayList<>()).add(index);
            }

            Set<OptionSignature> unresolvedSignatures = new HashSet<>();
            headIndexesBySignature.forEach((signature, indexes) -> {
                if (indexes.size() > 1) {
                    unresolvedSignatures.add(signature);
                }
            });
            for (Integer index : keylessIndexesByParent.getOrDefault(parent, List.of())) {
                OptionSignature signature = OptionSignature.from(options.apply(lines.get(index)));
                if (!headIndexesBySignature.containsKey(signature)) {
                    unresolvedSignatures.add(signature);
                }
            }
            if (!unresolvedSignatures.isEmpty()) {
                log.warn("레거시 BUNDLE 인스턴스 소속을 확정하지 못해 keyless 상태로 복원합니다: "
                                + "parentSetModel={}, keylessHeads={}, unresolvedSignatures={}",
                        parent, headIndexes.size(), unresolvedSignatures.size());
                continue;
            }

            for (Map.Entry<OptionSignature, List<Integer>> headEntry : headIndexesBySignature.entrySet()) {
                String key = UUID.randomUUID().toString();
                for (Integer index : keylessIndexesByParent.get(parent)) {
                    if (headEntry.getKey().equals(OptionSignature.from(options.apply(lines.get(index))))) {
                        keysByLineIndex.put(index, key);
                    }
                }
            }
        }

        List<BundleSetOptions> materialized = new ArrayList<>(lines.size());
        for (int index = 0; index < lines.size(); index++) {
            BundleSetOptions lineOptions = options.apply(lines.get(index));
            String key = keysByLineIndex.get(index);
            materialized.add(key == null ? lineOptions : withInstanceKey(lineOptions, key));
        }
        return Collections.unmodifiableList(materialized);
    }

    private record OptionSignature(
            String remoteOption,
            Boolean remoteExcluded,
            String panelOption,
            String panelShape360,
            Boolean materialIncluded) {

        private static OptionSignature from(BundleSetOptions options) {
            return options == null
                    ? new OptionSignature(null, null, null, null, null)
                    : new OptionSignature(normalizedText(options.remoteOption()),
                            options.remoteExcluded(), normalizedText(options.panelOption()),
                            normalizedText(options.panelShape360()), options.materialIncluded());
        }

        private static String normalizedText(String value) {
            if (value == null || value.isBlank()) {
                return null;
            }
            return value.trim();
        }
    }

    private static boolean hasInstanceKey(BundleSetOptions options) {
        return options != null && options.instanceKey() != null && !options.instanceKey().isBlank();
    }

    private static String normalizedParent(String parentSetModel) {
        if (parentSetModel == null || parentSetModel.isBlank()) {
            return null;
        }
        return parentSetModel.trim();
    }
}
