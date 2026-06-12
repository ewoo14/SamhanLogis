package com.samhanair.logis.slip.domain.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * V41 배차 차량 2축 backfill 매핑 SQL 계약 검증.
 */
class DispatchVehicle2AxisMigrationSqlTest {

    @Test
    void v41_backfill_maps_legacy_vehicle_type_to_body_type_and_tonnage() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V41__dispatch_vehicle_2axis.sql");
        Path rootPath = Path.of("services/slip-service/src/main/resources/db/migration/V41__dispatch_vehicle_2axis.sql");
        String sql = Files.readString(Files.exists(modulePath) ? modulePath : rootPath);

        assertThat(sql).contains("WHEN 'MOTORCYCLE' THEN 'MOTORCYCLE'");
        assertThat(sql).contains("WHEN 'DAMAS' THEN 'DAMAS'");
        assertThat(sql).contains("WHEN 'TONNAGE_1' THEN 'T_1'");
        assertThat(sql).contains("WHEN 'TONNAGE_1_5' THEN 'T_1_4'");
        assertThat(sql).contains("WHEN 'TONNAGE_2_5' THEN 'T_2_5'");
        assertThat(sql).contains("WHEN 'TONNAGE_3' THEN 'T_3_5'");
        assertThat(sql).contains("WHEN 'TONNAGE_5' THEN 'T_5'");
        assertThat(sql).contains("WHEN 'TONNAGE_10' THEN 'T_11'");
        assertThat(sql).contains("WHEN 'TONNAGE_20' THEN 'T_25'");
        assertThat(sql).contains("ALTER COLUMN vehicle_body_type SET NOT NULL");
        assertThat(sql).contains("chk_dispatch_vehicle_group_body_type");
        assertThat(sql).contains("chk_dispatch_vehicle_group_tonnage");
        assertThat(sql).contains("chk_dispatch_vehicle_group_body_tonnage_matrix");
    }
}
