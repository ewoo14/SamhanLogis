package com.samhanair.logis.slip.seed;

import org.springframework.stereotype.Component;

/**
 * 같은 기동 사이에서 선행 시더의 결과를 후속 시더에 전달한다.
 *
 * <p>시더 실패를 서비스 기동 실패로 전환하지 않는 정책을 유지하면서도,
 * 참조 데이터를 만드는 후속 시더가 실패를 성공으로 오인하지 않도록 한다.
 */
@Component
public class SeedDependencyState {

    private volatile SlipSeedStatus slipSeedStatus = SlipSeedStatus.NOT_RUN;

    public void markSlipSeedSucceeded() {
        slipSeedStatus = SlipSeedStatus.SUCCEEDED;
    }

    public void markSlipSeedFailed() {
        slipSeedStatus = SlipSeedStatus.FAILED;
    }

    public boolean isSlipSeedSucceeded() {
        return slipSeedStatus == SlipSeedStatus.SUCCEEDED;
    }

    public SlipSeedStatus slipSeedStatus() {
        return slipSeedStatus;
    }

    public enum SlipSeedStatus {
        NOT_RUN,
        SUCCEEDED,
        FAILED
    }
}
