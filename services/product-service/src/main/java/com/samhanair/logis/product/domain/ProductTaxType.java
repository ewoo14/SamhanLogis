package com.samhanair.logis.product.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** MIG-2/SAS 품목 단위 VAT 정책. */
@Getter
@RequiredArgsConstructor
public enum ProductTaxType {
    TAXABLE("과세"),
    ZERO_RATED("영세"),
    EXEMPT("면세");

    private final String displayName;
}
