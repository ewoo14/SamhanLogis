package com.samhanair.logis.product.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import java.util.Arrays;
import java.util.Optional;

/**
 * 제품 판매 상태. soft-delete 와 직교(orthogonal): 삭제는 마스터 데이터 보존을 위해
 * {@code is_deleted} 플래그로, 단종은 별도 enum 으로 관리한다 (개발책임자 결재).
 */
@Getter
@RequiredArgsConstructor
public enum ProductStatus {
    ACTIVE("판매중"),
    DISCONTINUED("단종"),
    NOT_FOR_SALE("미판매"),
    OUT_OF_STOCK("품절");

    private final String displayName;

    /** 시트 상태 열의 정확한 표시값만 상태로 해석한다. 괄호 포함 품명 등 유사 문자열은 제외한다. */
    public static Optional<ProductStatus> fromSheetDisplay(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        return Arrays.stream(values())
                .filter(status -> status.displayName.equals(value.trim()))
                .findFirst();
    }
}
