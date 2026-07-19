window.HOTEL_PRINT = Object.freeze({
  apiBase: "https://dhsgteuhxezvzqkbglxx.supabase.co/functions/v1/api",
  siteBase: "/Redlion-Hotel-Printing-Services",
  publishableKey: "sb_publishable_1sCc6Vi_3JnfHN8MRN5BAw_YqKhKs_c",
});

window.hotelPrintApiUrl = (path) => `${window.HOTEL_PRINT.apiBase}${path}`;
window.hotelPrintPageUrl = (page = "") => `${window.HOTEL_PRINT.siteBase}/${page}`;
