package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 전체 교체 편집에서 lineId 로 기존 영속 라인의 세트 계보를 결정적으로 승계한다.
 *
 * <p>수정 전 계약은 요청 라인에 영속 ID가 없어 fingerprint·거리·요청 순서 휴리스틱으로
 * 기존 라인을 추정했다. 그 방식은 신규 라인과 수정 라인을 구분할 수 없으므로 제거한다.
 * 현재 계약에서 {@code lineId != null} 인 라인은 해당 문서의 기존 라인으로 검증된 뒤 계보를
 * 승계하고, {@code lineId == null} 인 라인은 신규 평면 라인으로 남긴다.
 *
 * <p><b>품목 동일성 게이트 (D-R8-8)</b>: 개발책임자 도메인 확정 — <i>"세트 구성품의 정체성은
 * 품목에 묶여 있다. 품목을 교체하면 그 라인은 더 이상 그 세트의 구성품이 아니다."</i> 따라서
 * lineId 가 일치해도 <b>옛 productId 와 새 productId 가 다르면 계보를 승계하지 않는다</b>.
 * 이 게이트가 없으면 구성품 행의 품목을 무관한 단품으로 교체한 저장이 남의 계보를 상속해
 * 거짓 세트 표시가 영구 각인되고, 그 라인이 구성품으로 오판되어 사용자가 입력한 단가가
 * 가격기억에서 조용히 누락된다 (R8-BE-1/R8-QA-6 라이브 실증).
 *
 * <p>이는 <b>심층방어</b>이며 클라이언트측 lineId 관리 결함(FE 위치복원)의 대체재가 아니다.
 */
public final class BundleLineageResolver {

    private final Map<UUID, BundleLineage> lineagesById;

    private BundleLineageResolver(Map<UUID, BundleLineage> lineagesById) {
        this.lineagesById = lineagesById;
    }

    /** 기존 계보가 없는 신규 문서/신규 라인용 resolver. */
    public static BundleLineageResolver empty() {
        return new BundleLineageResolver(Map.of());
    }

    /** 기존 전표 라인의 영속 ID와 (품목, 세트 계보) 를 캡처한다. */
    public static BundleLineageResolver fromSlipLines(List<SlipLine> lines) {
        Map<UUID, BundleLineage> lineages = new HashMap<>();
        if (lines != null) {
            for (SlipLine line : lines) {
                if (line != null && line.getId() != null) {
                    lineages.put(line.getId(), new BundleLineage(
                            line.getProductId(), line.getParentSetModel(), line.isSetHead(),
                            line.getBundleSetOptions()));
                }
            }
        }
        return new BundleLineageResolver(lineages);
    }

    /** 기존 견적 라인의 영속 ID와 (품목, 세트 계보) 를 캡처한다. */
    public static BundleLineageResolver fromEstimateLines(List<EstimateLine> lines) {
        Map<UUID, BundleLineage> lineages = new HashMap<>();
        if (lines != null) {
            for (EstimateLine line : lines) {
                if (line != null && line.getId() != null) {
                    lineages.put(line.getId(), new BundleLineage(
                            line.getProductId(), line.getParentSetModel(), line.isSetHead(),
                            line.getBundleSetOptions()));
                }
            }
        }
        return new BundleLineageResolver(lineages);
    }

    /**
     * 새 전표 라인에 요청 lineId 순서대로 기존 계보를 승계한다.
     *
     * <p>lineIds 의 null 값은 신규 라인을 뜻한다. 소유권/존재 검증은 문서 서비스가 수행하며,
     * resolver 는 검증된 문서 라인 ID만 계보 map에서 조회한다.
     *
     * @param lines 전체 교체할 새 전표 라인
     * @param lineIds 각 새 라인이 승계할 기존 전표 라인 ID; 신규 라인은 null
     */
    public void restoreSlipLines(List<SlipLine> lines, List<UUID> lineIds) {
        if (lines == null || lines.isEmpty()) {
            return;
        }
        requireSameSize(lines.size(), lineIds);
        for (int i = 0; i < lines.size(); i++) {
            assign(lines.get(i), lineIds.get(i));
        }
    }

    /**
     * 새 견적 라인에 요청 lineId 순서대로 기존 계보를 승계한다.
     *
     * @param lines 전체 교체할 새 견적 라인
     * @param lineIds 각 새 라인이 승계할 기존 견적 라인 ID; 신규 라인은 null
     */
    public void restoreEstimateLines(List<EstimateLine> lines, List<UUID> lineIds) {
        if (lines == null || lines.isEmpty()) {
            return;
        }
        requireSameSize(lines.size(), lineIds);
        for (int i = 0; i < lines.size(); i++) {
            assign(lines.get(i), lineIds.get(i));
        }
    }

    /**
     * 이 문서(캡처된 기존 라인들)가 세트 계보(BUNDLE_SET) 를 <b>하나라도</b> 보유하는지.
     *
     * <p>계보 없는 평면 문서의 전교체를 오탐으로 막지 않기 위한 요약 조회다. R9의 실제 저장
     * 게이트는 boolean 요약이 아니라 {@link #bundleComponentLineIds()}를 사용해 구성품별로 대조한다.
     *
     * @return 캡처된 기존 라인 중 하나라도 세트 구성품(비어있지 않은 parentSetModel)이면 true
     */
    public boolean hasBundleLineage() {
        return !bundleComponentLineIds().isEmpty();
    }

    /**
     * 기존 문서에서 세트 계보를 보유한 구성품 라인의 영속 ID 집합을 반환한다.
     *
     * <p>일반 평면 라인의 ID는 포함하지 않는다. {@link LineIdContractGate} 는 이 집합을 요청의
     * lineId 목록과 구성품별로 대조해, 다른 구성품 ID 하나만 남긴 채 누락 구성품을 익명 라인으로
     * 재생성하는 부분 파괴를 차단한다. 반환값은 불변 집합이므로 호출자가 캡처 상태를 변경할 수 없다.
     *
     * @return 비어있지 않은 parentSetModel을 가진 기존 라인의 불변 ID 집합
     */
    public Set<UUID> bundleComponentLineIds() {
        return lineagesById.entrySet().stream()
                .filter(entry -> entry.getValue().isBundleComponent())
                .map(Map.Entry::getKey)
                .collect(Collectors.toUnmodifiableSet());
    }

    /** 세트 구성품 여부. parent model 이 서버 영속 계보의 권위값이다. */
    public static boolean isBundleComponent(SlipLine line) {
        return line != null && line.getParentSetModel() != null
                && !line.getParentSetModel().isBlank();
    }

    /** 세트 구성품 여부. parent model 이 서버 영속 계보의 권위값이다. */
    public static boolean isBundleComponent(EstimateLine line) {
        return line != null && line.getParentSetModel() != null
                && !line.getParentSetModel().isBlank();
    }

    /**
     * 저장에 남는 기존 BUNDLE 계보를 세트 인스턴스별로 검증한다.
     *
     * <p>세트 인스턴스의 정본은 JSONB {@code bundleSetOptions.instanceKey}와
     * {@code parentSetModel}의 조합이다. 같은 model을 두 번 넣은 행도 key가 다르면 서로
     * 다른 인스턴스로 판정된다. key가 없는 legacy 행은 하나의 model로만 안전하게 묶을 수
     * 있으며, 그 model에 역사적 head가 둘 이상이면 경계를 추정하지 않고 저장을 거부한다.
     * 단일 legacy 인스턴스는 저장 시 새 key를 materialize한다.
     *
     * <p>원본 인스턴스가 이미 0-head였던 경우는 legacy 상태로 인정한다. 새 검증이 기존 DB를
     * 소급해 무효화하지 않도록 하는 경계이며, 원본 head가 1개였던 인스턴스의 head 삭제는
     * 여전히 거부한다. 전체 인스턴스 삭제는 retained line이 없으므로 검증 대상이 아니다.
     *
     * @param originalLines 저장 전 활성 영속 라인
     * @param retainedLines 전체교체 저장 후 남길 라인
     * @param retainedLineIds retainedLines 각 행이 승계하는 원본 lineId
     * @throws BusinessException 기존 인스턴스의 head가 새로 0개 또는 2개 이상이거나,
     *                          key 없는 legacy 인스턴스 경계가 모호할 때
     */
    public static void requireSingleHeadPerRetainedBundleInstance(
            List<SlipLine> originalLines, List<SlipLine> retainedLines,
            List<UUID> retainedLineIds) {
        if (retainedLines == null) {
            return;
        }
        requireSameRetainedLineIds(retainedLines.size(), retainedLineIds);

        Map<UUID, ExistingBundleInstance> instanceByLineId = indexExistingInstances(originalLines);
        Map<Integer, Integer> retainedLineCounts = new HashMap<>();
        Map<Integer, Integer> retainedHeadCounts = new HashMap<>();
        Set<Integer> headChangedInstances = new HashSet<>();
        for (int i = 0; i < retainedLines.size(); i++) {
            UUID retainedLineId = retainedLineIds.get(i);
            ExistingBundleInstance instance = instanceByLineId.get(retainedLineId);
            if (instance == null) {
                // 신규 익명 BUNDLE은 validateAndAssignNewBundleLineage가 별도로 검증한다.
                continue;
            }
            requireExplicitKeyWhenLegacyInstanceIsAmbiguous(instance, retainedLines.get(i));
            if (instance.originalHeadLineIds.contains(retainedLineId)
                    && !Objects.equals(instance.originalProductIds.get(retainedLineId),
                    retainedLines.get(i).getProductId())) {
                headChangedInstances.add(instance.ordinal);
            }
            retainedLineCounts.merge(instance.ordinal, 1, Integer::sum);
            if (retainedLines.get(i).isSetHead()) {
                retainedHeadCounts.merge(instance.ordinal, 1, Integer::sum);
            }
        }

        for (ExistingBundleInstance instance : instanceByLineId.values()) {
            int retainedCount = retainedLineCounts.getOrDefault(instance.ordinal, 0);
            if (retainedCount == 0 || instance.historicalHeadCount == 0
                    || headChangedInstances.contains(instance.ordinal)) {
                continue;
            }
            if (retainedHeadCounts.getOrDefault(instance.ordinal, 0) != 1) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "세트 head 구성품은 삭제할 수 없습니다");
            }
        }
    }

    /** head 교체는 그 head가 속한 명시적 인스턴스 전체를 평면화한다. */
    public static void flattenHeadProductReplacements(
            List<SlipLine> originalLines, List<SlipLine> retainedLines,
            List<UUID> retainedLineIds) {
        if (retainedLines == null) {
            return;
        }
        requireSameRetainedLineIds(retainedLines.size(), retainedLineIds);
        Map<UUID, ExistingBundleInstance> instanceByLineId = indexExistingInstances(originalLines);
        Set<Integer> headChangedInstances = new HashSet<>();
        for (int i = 0; i < retainedLines.size(); i++) {
            ExistingBundleInstance instance = instanceByLineId.get(retainedLineIds.get(i));
            if (instance == null || !instance.originalHeadLineIds.contains(retainedLineIds.get(i))) {
                continue;
            }
            if (!Objects.equals(instance.originalProductIds.get(retainedLineIds.get(i)),
                    retainedLines.get(i).getProductId())) {
                headChangedInstances.add(instance.ordinal);
            }
        }
        if (headChangedInstances.isEmpty()) {
            return;
        }
        for (int i = 0; i < retainedLines.size(); i++) {
            ExistingBundleInstance instance = instanceByLineId.get(retainedLineIds.get(i));
            if (instance != null && headChangedInstances.contains(instance.ordinal)) {
                retainedLines.get(i).clearBundleComponent();
            }
        }
    }

    /** keyless legacy 인스턴스를 첫 정상 저장에서 JSONB instanceKey로 승격한다. */
    public static void materializeLegacyInstanceKeys(
            List<SlipLine> originalLines, List<SlipLine> retainedLines,
            List<UUID> retainedLineIds) {
        if (retainedLines == null) {
            return;
        }
        requireSameRetainedLineIds(retainedLines.size(), retainedLineIds);
        Map<UUID, ExistingBundleInstance> instanceByLineId = indexExistingInstances(originalLines);
        Map<Integer, String> generatedKeys = new HashMap<>();
        for (int i = 0; i < retainedLines.size(); i++) {
            ExistingBundleInstance instance = instanceByLineId.get(retainedLineIds.get(i));
            SlipLine line = retainedLines.get(i);
            if (instance == null || instance.instanceKey != null || !isBundleComponent(line)) {
                continue;
            }
            String key = generatedKeys.computeIfAbsent(instance.ordinal,
                    ignored -> UUID.randomUUID().toString());
            line.assignBundleComponent(line.getParentSetModel(), line.isSetHead(),
                    withInstanceKey(instance.bundleSetOptions, key));
        }
    }

    private static Map<UUID, ExistingBundleInstance> indexExistingInstances(
            List<SlipLine> originalLines) {
        Map<UUID, ExistingBundleInstance> indexed = new HashMap<>();
        if (originalLines == null) {
            return indexed;
        }
        Map<String, ExistingBundleInstance> instancesByKey = new HashMap<>();
        int[] ordinal = {0};
        for (SlipLine line : originalLines) {
            if (!isBundleComponent(line)) {
                continue;
            }
            String parentSetModel = line.getParentSetModel().trim();
            String instanceKey = instanceKey(line.getBundleSetOptions());
            String groupingKey = instanceKey == null
                    ? "legacy:" + parentSetModel
                    : "keyed:" + instanceKey + ":" + parentSetModel;
            ExistingBundleInstance current = instancesByKey.computeIfAbsent(
                    groupingKey, ignored -> new ExistingBundleInstance(
                            ordinal[0]++, parentSetModel, instanceKey,
                            line.getBundleSetOptions()));
            current.lineCount++;
            current.originalProductIds.put(line.getId(), line.getProductId());
            if (line.isSetHead()) {
                current.historicalHeadCount++;
                current.originalHeadLineIds.add(line.getId());
            }
            indexed.put(line.getId(), current);
        }
        Map<String, Integer> headCountsByLegacyModel = new HashMap<>();
        for (ExistingBundleInstance instance : instancesByKey.values()) {
            if (instance.instanceKey == null) {
                headCountsByLegacyModel.merge(instance.parentSetModel,
                        instance.historicalHeadCount, Integer::sum);
            }
        }
        for (ExistingBundleInstance instance : instancesByKey.values()) {
            instance.ambiguousLegacy = instance.instanceKey == null
                    && headCountsByLegacyModel.getOrDefault(instance.parentSetModel, 0) > 1;
        }
        return indexed;
    }

    private static void requireExplicitKeyWhenLegacyInstanceIsAmbiguous(
            ExistingBundleInstance instance, SlipLine retainedLine) {
        if (instance.ambiguousLegacy && instance.instanceKey == null
                && instance.historicalHeadCount > 0
                && retainedLine.getBundleSetOptions() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "기존 세트 인스턴스의 경계가 불명확합니다. 최신 상세를 다시 열어 저장해 주세요");
        }
    }

    private static String instanceKey(BundleSetOptions options) {
        if (options == null || options.instanceKey() == null || options.instanceKey().isBlank()) {
            return null;
        }
        return options.instanceKey().trim();
    }

    private static BundleSetOptions withInstanceKey(BundleSetOptions options, String key) {
        return new BundleSetOptions(
                options == null ? null : options.remoteOption(),
                options == null ? null : options.remoteExcluded(),
                options == null ? null : options.panelOption(),
                options == null ? null : options.panelShape360(),
                options == null ? null : options.materialIncluded(),
                key);
    }

    private static void requireSameRetainedLineIds(int lineCount, List<UUID> lineIds) {
        if (lineIds == null || lineIds.size() != lineCount) {
            throw new IllegalArgumentException("라인과 lineId 목록의 크기가 일치하지 않습니다");
        }
    }

    private static final class ExistingBundleInstance {
        private final int ordinal;
        private final String parentSetModel;
        private final String instanceKey;
        private final BundleSetOptions bundleSetOptions;
        private final Map<UUID, UUID> originalProductIds = new HashMap<>();
        private final Set<UUID> originalHeadLineIds = new HashSet<>();
        private int lineCount;
        private int historicalHeadCount;
        private boolean ambiguousLegacy;

        private ExistingBundleInstance(int ordinal, String parentSetModel, String instanceKey,
                                       BundleSetOptions bundleSetOptions) {
            this.ordinal = ordinal;
            this.parentSetModel = parentSetModel;
            this.instanceKey = instanceKey;
            this.bundleSetOptions = bundleSetOptions;
        }
    }

    private void assign(SlipLine line, UUID lineId) {
        if (line == null || lineId == null) {
            return;
        }
        BundleLineage lineage = lineagesById.get(lineId);
        if (lineage != null && lineage.inheritableBy(line.getProductId())) {
            line.assignBundleComponent(lineage.parentSetModel(), lineage.setHead(), lineage.bundleSetOptions());
        }
    }

    private void assign(EstimateLine line, UUID lineId) {
        if (line == null || lineId == null) {
            return;
        }
        BundleLineage lineage = lineagesById.get(lineId);
        if (lineage != null && lineage.inheritableBy(line.getProductId())) {
            line.assignBundleComponent(lineage.parentSetModel(), lineage.setHead(), lineage.bundleSetOptions());
        }
    }

    private void requireSameSize(int lineCount, List<UUID> lineIds) {
        if (lineIds == null || lineIds.size() != lineCount) {
            throw new IllegalArgumentException("라인과 lineId 목록의 크기가 일치하지 않습니다");
        }
    }

    /**
     * 기존 영속 라인 1건의 (품목, 세트 계보) 캡처.
     *
     * @param productId 캡처 시점의 품목 UUID — 승계 대상 라인이 같은 품목인지 검증하는 기준
     */
    private record BundleLineage(UUID productId, String parentSetModel, boolean setHead,
                                 BundleSetOptions bundleSetOptions) {

        private boolean isBundleComponent() {
            return parentSetModel != null && !parentSetModel.isBlank();
        }

        /**
         * 이 계보를 {@code candidateProductId} 라인이 승계할 수 있는지.
         *
         * <p>D-R8-8 — 세트 계보이면서 품목이 그대로일 때만 승계한다. 품목이 바뀌었으면 그 라인은
         * 더 이상 그 세트의 구성품이 아니므로 (null 품목 포함) 승계를 거부하고 평면 라인으로 남긴다.
         */
        private boolean inheritableBy(UUID candidateProductId) {
            return isBundleComponent() && Objects.equals(productId, candidateProductId);
        }
    }
}
