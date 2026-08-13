package com.samhanair.logis.inventory.web;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.domain.StockInstanceQuality;
import com.samhanair.logis.inventory.service.StockInstanceService;
import com.samhanair.logis.inventory.web.dto.UpdateStockInstanceQualityRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** S2a 불변식 4 — 화면 우회 품질 변경 API 호출도 SHIPPED에서 거부되어야 한다. */
class StockInstanceControllerS2aTest {

    @Test
    @DisplayName("품질 변경 API를 직접 호출해도 SHIPPED 인스턴스는 거부된다")
    void directQualityApi_shippedIsRejected() {
        StockInstanceService service = mock(StockInstanceService.class);
        when(service.updateQuality("SI-ABC234", StockInstanceQuality.DAMAGED, "user-1", "홍길동"))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT,
                        "SHIPPED 인스턴스의 품목 상태는 변경할 수 없습니다."));
        StockInstanceController controller = new StockInstanceController(service);

        assertThatThrownBy(() -> controller.updateQuality(
                "SI-ABC234", new UpdateStockInstanceQualityRequest(StockInstanceQuality.DAMAGED),
                "user-1", "홍길동"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("SHIPPED");
    }
}
