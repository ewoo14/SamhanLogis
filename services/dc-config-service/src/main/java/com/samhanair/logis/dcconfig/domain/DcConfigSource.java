package com.samhanair.logis.dcconfig.domain;

/**
 * DC 설정의 출처 (감사용).
 *
 * <p>legacy CSV 222 row 시드는 {@link #LEGACY_CSV}, Notion DB 포팅은 {@link #NOTION_DB},
 * 운영 중 admin UI 변경은 {@link #ADMIN_EDIT}, internal RPC (M2 등) 는 {@link #INTERNAL_RPC}.
 */
public enum DcConfigSource {
    LEGACY_CSV,
    NOTION_DB,
    ADMIN_EDIT,
    INTERNAL_RPC
}
