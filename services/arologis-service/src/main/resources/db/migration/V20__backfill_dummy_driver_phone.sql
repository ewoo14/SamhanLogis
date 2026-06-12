UPDATE drivers
   SET phone_number = NULL
 WHERE phone_number = '010-0000-0000'
   AND is_deleted = FALSE;
