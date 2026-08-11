package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Predicate;

/** 서버 BUNDLE 전개 한 건에 저장할 인스턴스 키를 보장한다. */
public final class BundleSetInstanceKeyPolicy {

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
     * <p>동일 parentSetModel의 keyless head가 둘 이상이면 각 head부터 다음 같은 parent의 head
     * 직전까지를 하나의 인스턴스로 본다. head 앞에 keyless 구성품이 있으면 스냅샷만으로 경계를
     * 확정할 수 없으므로 복원 전체를 거부한다. 단일 keyless 인스턴스와 이미 키가 있는 라인은
     * 하위호환을 위해 그대로 보존한다.
     */
    public static <T> List<BundleSetOptions> materializeLegacyMultiInstanceKeys(
            List<T> lines, Function<T, String> parentSetModel,
            Predicate<T> setHead, Function<T, BundleSetOptions> options) {
        if (lines == null || lines.isEmpty()) {
            return List.of();
        }
        Map<String, Integer> keylessHeadCounts = new HashMap<>();
        for (T line : lines) {
            String parent = normalizedParent(parentSetModel.apply(line));
            if (parent != null && setHead.test(line) && !hasInstanceKey(options.apply(line))) {
                keylessHeadCounts.merge(parent, 1, Integer::sum);
            }
        }

        Map<String, String> activeKeys = new HashMap<>();
        List<BundleSetOptions> materialized = new ArrayList<>(lines.size());
        for (T line : lines) {
            BundleSetOptions lineOptions = options.apply(line);
            String parent = normalizedParent(parentSetModel.apply(line));
            if (parent == null || hasInstanceKey(lineOptions)
                    || keylessHeadCounts.getOrDefault(parent, 0) < 2) {
                materialized.add(lineOptions);
                continue;
            }
            if (setHead.test(line)) {
                activeKeys.put(parent, UUID.randomUUID().toString());
            }
            String key = activeKeys.get(parent);
            if (key == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "레거시 BUNDLE 스냅샷의 인스턴스 경계를 확정할 수 없습니다.");
            }
            materialized.add(withInstanceKey(lineOptions, key));
        }
        return Collections.unmodifiableList(materialized);
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
