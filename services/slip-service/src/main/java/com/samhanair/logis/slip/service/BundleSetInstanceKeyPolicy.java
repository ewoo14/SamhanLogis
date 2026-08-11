package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import java.util.UUID;

/** 서버 BUNDLE 전개 한 건에 저장할 인스턴스 키를 보장한다. */
public final class BundleSetInstanceKeyPolicy {

    private BundleSetInstanceKeyPolicy() {
    }

    /**
     * 명시된 키는 그대로 보존하고, 키가 없거나 공백이면 기존 5개 옵션을 유지한 새 옵션을 반환한다.
     *
     * @param options 클라이언트가 보낸 BUNDLE 옵션
     * @return 비어 있지 않은 인스턴스 키를 가진 저장용 옵션
     */
    public static BundleSetOptions ensure(BundleSetOptions options) {
        if (options != null && options.instanceKey() != null && !options.instanceKey().isBlank()) {
            return options;
        }
        return new BundleSetOptions(
                options == null ? null : options.remoteOption(),
                options == null ? null : options.remoteExcluded(),
                options == null ? null : options.panelOption(),
                options == null ? null : options.panelShape360(),
                options == null ? null : options.materialIncluded(),
                UUID.randomUUID().toString());
    }
}
