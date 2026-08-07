package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.web.dto.EcountWarehouseAliasResponse;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** eCount 코드와 활성 내부 창고의 권위 alias(staging.ecount_warehouse_map) read 저장소. */
@Repository
@RequiredArgsConstructor
public class EcountWarehouseAliasRepository {

    private final NamedParameterJdbcTemplate jdbcTemplate;

    /**
     * 요청된 eCount 코드 중 활성 warehouse에 연결된 alias만 반환한다.
     *
     * <p>없는 코드는 결과에서 제외한다. 호출자는 “alias가 없음”과 저장소/네트워크 장애를
     * 구분해야 하므로 이 메서드는 빈 목록을 예외로 바꾸지 않는다.
     */
    public List<EcountWarehouseAliasResponse> findActiveByEcountCodes(Collection<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return List.of();
        }
        return jdbcTemplate.query("""
                SELECT m.ecount_code,
                       m.ecount_name,
                       m.warehouse_uuid
                  FROM staging.ecount_warehouse_map m
                  JOIN warehouses w
                    ON w.id = m.warehouse_uuid
                   AND w.is_deleted = FALSE
                 WHERE m.ecount_code IN (:codes)
                 ORDER BY m.ecount_code
                """,
                new MapSqlParameterSource("codes", codes),
                (rs, rowNum) -> new EcountWarehouseAliasResponse(
                        rs.getString("ecount_code"),
                        rs.getString("ecount_name"),
                        UUID.fromString(rs.getString("warehouse_uuid"))));
    }
}
