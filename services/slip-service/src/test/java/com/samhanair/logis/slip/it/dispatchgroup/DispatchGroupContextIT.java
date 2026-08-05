package com.samhanair.logis.slip.it.dispatchgroup;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.dispatchgroup.CarrierRepository;
import com.samhanair.logis.slip.service.dispatchgroup.DispatchGroupService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** 신규 엔티티·repository·service·controller 빈과 V104 배선을 함께 확인한다. */
@SpringBootTest(classes = SlipServiceApplication.class)
class DispatchGroupContextIT extends AbstractPostgresIT {

    @Autowired private DispatchGroupService dispatchGroupService;
    @Autowired private CarrierRepository carrierRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void context_loads_new_dispatch_group_graph_and_v104_seed() {
        assertThat(dispatchGroupService).isNotNull();
        assertThat(carrierRepository.findByCodeIgnoreCaseAndIsDeletedFalse("AROLOGIS"))
                .get().extracting(carrier -> carrier.isArologis()).isEqualTo(true);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from carriers where code = 'AROLOGIS' and is_arologis = true", Integer.class))
                .isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from information_schema.table_constraints "
                        + "where table_name = 'dispatch_group_slips' and constraint_type = 'FOREIGN KEY'", Integer.class))
                .isGreaterThanOrEqualTo(2);
    }
}
