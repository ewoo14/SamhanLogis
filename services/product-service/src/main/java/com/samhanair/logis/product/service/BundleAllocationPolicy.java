package com.samhanair.logis.product.service;

import com.samhanair.logis.product.domain.BundleComponent;
import java.math.BigDecimal;
import java.util.List;

/** #1143 구성품별 자동/고정·비중 계약의 단일 검증 지점. */
public final class BundleAllocationPolicy {
    public static final BigDecimal DEFAULT_ROUND_UNIT = BigDecimal.valueOf(1000);

    private BundleAllocationPolicy() {}

    public record Item(BundleComponent.AllocationMode mode, int weight, BigDecimal fixedAmount) {}

    public static Item item(BundleComponent.AllocationMode mode, int weight, BigDecimal fixedAmount) {
        return new Item(mode, weight, fixedAmount);
    }

    public static void validate(List<Item> items) {
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("배분 구성품은 1개 이상이어야 합니다.");
        }
        int autoSum = 0;
        int autoCount = 0;
        for (Item item : items) {
            if (item == null || item.mode() == null) {
                throw new IllegalArgumentException("배분 방식은 필수입니다.");
            }
            if (item.mode() == BundleComponent.AllocationMode.AUTO) {
                autoCount++;
                if (item.weight() < 1 || item.weight() >= 10) {
                    throw new IllegalArgumentException("자동 비중은 1 이상 10 미만이어야 합니다.");
                }
                autoSum += item.weight();
            } else if (item.fixedAmount() == null || item.fixedAmount().signum() < 0) {
                throw new IllegalArgumentException("고정 구성품 금액은 0 이상이어야 합니다.");
            }
        }
        if (autoCount > 0 && autoSum != 10) {
            throw new IllegalArgumentException("자동 구성품 비중 합은 10이어야 합니다.");
        }
    }
}
