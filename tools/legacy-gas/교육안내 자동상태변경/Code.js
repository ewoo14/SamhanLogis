function checkAndUpdateNotion() {
  var NOTION_API_KEY = "REDACTED_NOTION_TOKEN";
  var DATABASE_ID = "1b5a1006d658804b9d6fc48f7b735490";
  var NOTION_VERSION = "2022-06-28";

  // 데이터베이스 쿼리 URL 및 옵션 설정
  var queryUrl = "https://api.notion.com/v1/databases/" + DATABASE_ID + "/query";
  var queryOptions = {
    method: "post",
    headers: {
      "Authorization": "Bearer " + NOTION_API_KEY,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION
    },
    payload: JSON.stringify({}),
    muteHttpExceptions: true
  };

  // 데이터베이스에서 페이지 불러오기
  var response = UrlFetchApp.fetch(queryUrl, queryOptions);
  var data = JSON.parse(response.getContentText());
  
  // 현재 시간 가져오기
  var now = new Date();

  if (data.results && data.results.length > 0) {
    data.results.forEach(function(page) {
      var properties = page.properties;
      var pageId = page.id;

      // 1. 등록마감일 업데이트 처리
      if (properties && properties["등록마감일"] &&
          properties["등록마감일"].date && properties["등록마감일"].date.start) {
        var deadlineStr = properties["등록마감일"].date.start;
        var deadline = new Date(deadlineStr);
        
        // 마감일이 지난 경우
        if (now.getTime() > deadline.getTime()) {
          // "가능여부"가 아직 "신청불가"가 아니라면 업데이트 요청
          if (!(properties["가능여부"] && properties["가능여부"].select && properties["가능여부"].select.name === "신청불가")) {
            var updateUrl = "https://api.notion.com/v1/pages/" + pageId;
            var updatePayload = {
              properties: {
                "가능여부": {
                  select: { name: "신청불가" }
                }
              }
            };
            var updateOptions = {
              method: "patch",
              headers: {
                "Authorization": "Bearer " + NOTION_API_KEY,
                "Content-Type": "application/json",
                "Notion-Version": NOTION_VERSION
              },
              payload: JSON.stringify(updatePayload),
              muteHttpExceptions: true
            };
            UrlFetchApp.fetch(updateUrl, updateOptions);
            Logger.log("등록마감일 업데이트 완료: " + pageId);
          } else {
            Logger.log("등록마감일: 이미 신청불가인 페이지: " + pageId);
          }
        }
      }
      
      // 2. 문자발송내역 업데이트 처리 (파일이 단순히 존재하는지만 확인)
      if (properties && properties["문자발송내역"] &&
          properties["문자발송내역"].files && properties["문자발송내역"].files.length > 0) {
        // "안내문자발송"이 아직 "발송완료"가 아니라면 업데이트 요청
        if (!(properties["안내문자발송"] && properties["안내문자발송"].select && properties["안내문자발송"].select.name === "발송완료")) {
          var updateUrl2 = "https://api.notion.com/v1/pages/" + pageId;
          var updatePayload2 = {
            properties: {
              "안내문자발송": {
                select: { name: "발송완료" }
              }
            }
          };
          var updateOptions2 = {
            method: "patch",
            headers: {
              "Authorization": "Bearer " + NOTION_API_KEY,
              "Content-Type": "application/json",
              "Notion-Version": NOTION_VERSION
            },
            payload: JSON.stringify(updatePayload2),
            muteHttpExceptions: true
          };
          UrlFetchApp.fetch(updateUrl2, updateOptions2);
          Logger.log("문자발송내역 업데이트 완료: " + pageId);
        } else {
          Logger.log("문자발송내역: 이미 발송완료인 페이지: " + pageId);
        }
      }
    });
  } else {
    Logger.log("데이터베이스에서 페이지를 찾지 못했습니다.");
  }
}