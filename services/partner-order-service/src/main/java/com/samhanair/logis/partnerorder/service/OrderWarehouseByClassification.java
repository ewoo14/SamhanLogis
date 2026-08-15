package com.samhanair.logis.partnerorder.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** 주문서웹 확정 시 품목분류로 주문 전체의 창고를 결정한다. 품명 검색과 정규식은 사용하지 않는다. */
public final class OrderWarehouseByClassification {
    public static final String SANGIL_WAREHOUSE_CODE = "2";
    public static final String CHOWOL_WAREHOUSE_CODE = "00003";

    private static final Set<String> HOME_HITS = Set.of("실내기|1-Way 인피니트", "판넬|인피니트");
    private static final Set<String> SINGLE_HIT_L = Set.of(
            "360", "4way 냉방전용", "1way 냉방전용", "냉전 스탠드", "냉전 벽걸이",
            "1way 냉난방", "덕트", "비스포크 스탠드", "냉난방 벽걸이", "가정용 에어컨");
    private static final Set<String> SINGLE_HIT_PAIRS = Set.of(
            "4way 냉난방|1등급", "냉난방 스탠드|1등급");
    private static final Set<String> KNOWN_PRODUCT_CATEGORIES = Set.of(
            "HOME_MULTI", "SINGLE_SET", "SINGLE_PART", "COMMERCIAL_MULTI", "COMMERCIAL_PART", "OLD", "MATERIAL");

    public Decision decide(List<Item> items) {
        if (items == null || items.isEmpty()) {
            return new Decision(CHOWOL_WAREHOUSE_CODE, List.of());
        }
        boolean sangil = false;
        List<String> unclassifiedModels = new ArrayList<>();
        for (Item item : items) {
            if (isMissingOrUnknown(item)) {
                unclassifiedModels.add(item == null || blank(item.modelCode()) ? "<unknown>" : item.modelCode().trim());
                continue;
            }
            if (isSangil(item)) {
                sangil = true;
            }
        }
        return new Decision(sangil ? SANGIL_WAREHOUSE_CODE : CHOWOL_WAREHOUSE_CODE, unclassifiedModels);
    }

    private boolean isSangil(Item item) {
        String key = normalize(item.catL()) + "|" + normalize(item.catM());
        if ("HOME_MULTI".equals(item.productCategory())) {
            return HOME_HITS.contains(key);
        }
        if ("SINGLE_SET".equals(item.productCategory()) || "SINGLE_PART".equals(item.productCategory())) {
            return SINGLE_HIT_L.contains(normalize(item.catL())) || SINGLE_HIT_PAIRS.contains(key);
        }
        return false;
    }

    private boolean isMissingOrUnknown(Item item) {
        if (item == null || blank(item.modelCode()) || blank(item.productCategory())
                || blank(item.catL()) || blank(item.catM())) {
            return true;
        }
        if (!KNOWN_PRODUCT_CATEGORIES.contains(item.productCategory())) {
            return true;
        }
        if ("HOME_MULTI".equals(item.productCategory())) {
            return !HOME_HITS.contains(normalize(item.catL()) + "|" + normalize(item.catM()));
        }
        if ("SINGLE_SET".equals(item.productCategory()) || "SINGLE_PART".equals(item.productCategory())) {
            String l = normalize(item.catL());
            return !SINGLE_HIT_L.contains(l) && !SINGLE_HIT_PAIRS.contains(l + "|" + normalize(item.catM()))
                    && !Set.of("4way 냉난방", "냉난방 스탠드", "4way 냉방전용", "1way 냉방전용",
                    "냉전 스탠드", "냉전 벽걸이", "1way 냉난방", "덕트", "비스포크 스탠드",
                    "냉난방 벽걸이", "가정용 에어컨").contains(l)
                    && !"360".equals(l);
        }
        return false;
    }

    private static String normalize(String value) { return value == null ? "" : value.trim(); }
    private static boolean blank(String value) { return value == null || value.isBlank(); }

    public record Item(String modelCode, String productCategory, String catL, String catM) { }
    public record Decision(String warehouseCode, List<String> unclassifiedModels) {
        public int unclassifiedCount() { return unclassifiedModels.size(); }
    }
}
