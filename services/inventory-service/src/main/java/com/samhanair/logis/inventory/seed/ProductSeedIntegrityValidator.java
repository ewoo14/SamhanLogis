package com.samhanair.logis.inventory.seed;

import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** 재고 seed가 참조할 product seed 세대의 활성 master 정합성을 검사한다. */
@Component
public class ProductSeedIntegrityValidator {

    private static final String PRODUCT_UUID_PREFIX = "samhan-seed:product:";
    private final ProductClient productClient;

    public ProductSeedIntegrityValidator(ProductClient productClient) {
        this.productClient = productClient;
    }

    /**
     * 모든 modelName이 deterministic UUID의 활성 product로 조회되는지 확인한다.
     * product-service의 internal lookup은 soft-deleted product를 반환하지 않는다.
     *
     * @throws IllegalStateException 누락 product 또는 product-service 조회 실패
     */
    public void validate(List<String> modelNames) {
        List<UUID> expectedIds = modelNames.stream().map(ProductSeedIntegrityValidator::productId).toList();
        try {
            List<ProductSummary> actual = productClient.lookupForSeedIntegrity(expectedIds);
            var actualIds = actual.stream().map(ProductSummary::id).collect(java.util.stream.Collectors.toSet());
            List<String> missingModels = modelNames.stream()
                    .filter(modelName -> !actualIds.contains(productId(modelName)))
                    .toList();
            if (!missingModels.isEmpty()) {
                throw new IllegalStateException(missingMessage(missingModels));
            }
        } catch (IllegalStateException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new IllegalStateException(
                    "재고 seed 중단: product-service의 활성 product를 조회하지 못했습니다. "
                            + "product-service를 먼저 공통 seed toggle로 기동한 뒤 재시도하십시오. 원인: " + ex.getMessage(), ex);
        }
    }

    static UUID productId(String modelName) {
        return UUID.nameUUIDFromBytes((PRODUCT_UUID_PREFIX + modelName).getBytes(StandardCharsets.UTF_8));
    }

    private static String missingMessage(List<String> missingModels) {
        return "재고 seed 중단: 활성 product " + missingModels.size() + "개가 없습니다. 누락 모델="
                + missingModels + ". product-service를 먼저 공통 seed toggle로 기동하고 product seed 완료 후 "
                + "재고 seed를 재시도하십시오. 기존 stock_balances는 변경하지 않았습니다.";
    }
}
