package com.samhanair.logis.inventory.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.repository.EcountWarehouseAliasRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.EcountWarehouseAliasResponse;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** eCount alias endpoint가 public warehouses.code 역조회와 분리되어 staging을 읽는지 확인한다. */
@ExtendWith(MockitoExtension.class)
class InternalWarehouseControllerTest {

    @Mock
    private WarehouseRepository warehouseRepository;
    @Mock
    private EcountWarehouseAliasRepository ecountWarehouseAliasRepository;
    @InjectMocks
    private InternalWarehouseController controller;

    @Test
    void eCount_alias는_요청코드를_정규화해_staging_repository에_위임한다() {
        UUID warehouseId = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        when(ecountWarehouseAliasRepository.findActiveByEcountCodes(anySet()))
                .thenReturn(List.of(new EcountWarehouseAliasResponse("00003", "삼성창고", warehouseId)));

        var response = controller.byEcountCodes(" 00003, 2,00003 ");

        assertThat(response.getData()).hasSize(1);
        assertThat(response.getData().get(0).ecountCode()).isEqualTo("00003");
        verify(ecountWarehouseAliasRepository).findActiveByEcountCodes(Set.of("00003", "2"));
    }

    @Test
    void eCount_alias_결과가_없으면_빈_목록을_그대로_반환해_NOT_FOUND와_장애를_구분한다() {
        when(ecountWarehouseAliasRepository.findActiveByEcountCodes(Set.of("14")))
                .thenReturn(List.of());

        assertThat(controller.byEcountCodes("14").getData()).isEmpty();
    }

    @Test
    void 빈_codes는_400_입력오류다() {
        assertThatThrownBy(() -> controller.byEcountCodes(" , "))
                .hasMessageContaining("codes 파라미터");
    }
}
