package com.samhanair.logis.slip.seed;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * product-service HvacProductSeeder.buildAllRows 와 동일한 dev seed product catalog.
 *
 * <p>cross-DB seed 정합 규칙:
 * {@code products.id = UUID.nameUUIDFromBytes("samhan-seed:product:" + modelName)}.
 * modelName 이 변경되면 product/inventory/slip/partner-order seeder 를 함께 갱신해야 한다.
 */
final class HvacSeedProductCatalog {

    private static final String PRODUCT_UUID_PREFIX = "samhan-seed:product:";
    private static final List<ProductSeed> PRODUCTS = buildProducts();

    private HvacSeedProductCatalog() {
    }

    static int size() {
        return PRODUCTS.size();
    }

    static ProductSeed byOneBasedSeq(int seq) {
        if (seq < 1 || seq > PRODUCTS.size()) {
            throw new IllegalArgumentException("product seq 범위 오류: " + seq);
        }
        return PRODUCTS.get(seq - 1);
    }

    static UUID deterministicProductId(String modelName) {
        return UUID.nameUUIDFromBytes(
                (PRODUCT_UUID_PREFIX + modelName).getBytes(StandardCharsets.UTF_8));
    }

    private static List<ProductSeed> buildProducts() {
        ArrayList<ProductSeed> rows = new ArrayList<>(100);

        int[] pyongWall = {5, 6, 7, 9, 11, 13, 15, 16, 18, 20};
        for (int i = 1; i <= 30; i++) {
            int p = pyongWall[(i - 1) % pyongWall.length];
            rows.add(new ProductSeed(
                    String.format("AR%02dTXEAAWKNEU-%02d", p, i),
                    "삼성 윈드프리 " + p + "평형"));
        }

        int[] pyongStand = {15, 17, 18, 20, 23, 25, 26, 30};
        for (int i = 31; i <= 50; i++) {
            int p = pyongStand[(i - 31) % pyongStand.length];
            rows.add(new ProductSeed(
                    String.format("AF%02dBX1NWAEAH-%02d", p, i),
                    "삼성 비스포크 스탠드 " + p + "평형"));
        }

        int[] hpDvm = {3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22};
        for (int i = 51; i <= 75; i++) {
            int hp = hpDvm[(i - 51) % hpDvm.length];
            rows.add(new ProductSeed(
                    String.format("AM%03dBNNDEH-%02d", hp * 10, i),
                    "삼성 DVM-S " + hp + "HP"));
        }

        String[] tonnages = {"3톤", "4톤", "5톤", "6톤", "8톤", "10톤", "12톤", "15톤", "18톤", "20톤"};
        for (int i = 76; i <= 85; i++) {
            int idx = i - 76;
            rows.add(new ProductSeed(
                    String.format("AC%03dCNCDEH-%02d", (idx + 1) * 100, i),
                    "삼성 천장형 " + tonnages[idx]));
        }

        int[] squareMeters = {17, 23, 30, 35, 40, 50, 60, 75, 90, 100};
        for (int i = 86; i <= 95; i++) {
            int m = squareMeters[i - 86];
            rows.add(new ProductSeed(
                    String.format("AX%02dB%dNNDB-%02d", m, m, i),
                    "삼성 비스포크 큐브 " + m + "㎡"));
        }

        rows.add(new ProductSeed("PIPE-CU-15A", "동관 15A"));
        rows.add(new ProductSeed("PIPE-CU-22A", "동관 22A"));
        rows.add(new ProductSeed("INSUL-T20", "절연재 T20"));
        rows.add(new ProductSeed("REMOTE-MR-DH00", "유선 리모컨 MR-DH00"));
        rows.add(new ProductSeed("COMM-MIM-N10", "외부 통신 모듈 MIM-N10"));

        if (rows.size() != 100) {
            throw new IllegalStateException("Hvac seed product catalog size mismatch: " + rows.size());
        }
        return List.copyOf(rows);
    }

    record ProductSeed(String modelName, String productName) {
    }
}
