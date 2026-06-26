package com.samhanair.logis.notification.domain;

/**
 * 푸시 디바이스 플랫폼.
 *
 * <p>DB CHECK 제약과 동일하게 ANDROID / IOS / WEB 만 허용한다.
 */
public enum PushDevicePlatform {
    ANDROID,
    IOS,
    WEB
}
