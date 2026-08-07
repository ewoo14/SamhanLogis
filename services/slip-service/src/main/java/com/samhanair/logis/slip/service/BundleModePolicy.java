package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.ProductSummary;

/** BUNDLE mode를 생산 입구에서 동일하게 해석하는 정책 경계. */
public final class BundleModePolicy {

    private BundleModePolicy() {
    }

    /** KEEP 부모는 1행으로 보존하고, EXPAND/NULL BUNDLE만 전개한다. */
    public static boolean shouldExpand(ProductSummary summary) {
        return summary != null
                && "BUNDLE".equals(summary.productType())
                && !"KEEP".equalsIgnoreCase(summary.bundleMode());
    }
}
