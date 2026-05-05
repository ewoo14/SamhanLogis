package com.samhanair.logis.partnerorder.web.dto;

/**
 * 튜토리얼 PATCH 요청. completed=true 시 endTut.
 */
public record TutorialPatchRequest(boolean completed) {
}
