/**
 * ════════════════════════════════════════════════════════════
 *  CarparkStatus.gs — Live Status Web App
 * ════════════════════════════════════════════════════════════
 *  ⚠️ ไฟล์นี้ "เพิ่มแยก" เข้าไปในโปรเจกต์ parkingReminder เดิม
 *     — ห้าม replace Code.gs — แค่สร้างไฟล์ใหม่แล้ววางโค้ดนี้
 *
 *  ใช้ของเดิมร่วมกัน (ไม่ประกาศซ้ำ): CONFIG, mapSheetRowToPayload_, toDate_
 *  ไม่ชนชื่อฟังก์ชัน/ตัวแปรใดๆ ใน Code.gs · อ่านชีตอย่างเดียว ไม่เขียนทับ
 *
 *  หน้าที่: คืนสถานะที่จอดรถล่าสุด — อ่านชีตสด "ทุกครั้ง" ที่ถูกเรียก
 *    GET  .../exec              → JSON เต็ม
 *    GET  .../exec?format=text  → ข้อความบรรทัดเดียว (ช่อง summary)
 *
 *  วิธี deploy: ดู SECTION ท้ายไฟล์
 * ════════════════════════════════════════════════════════════
 */

function doGet(e) {
  var data = carparkBuildStatus_();
  if (e && e.parameter && e.parameter.format === "text") {
    return ContentService
      .createTextOutput(data.summary || data.error || "")
      .setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * อ่านชีต Sheet1 → หาแถวล่าสุด → สร้างสรุปสถานะที่จอดรถ
 */
function carparkBuildStatus_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return { error: "ไม่พบชีต " + CONFIG.SHEET_NAME };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { error: "ไม่มีข้อมูล" };

  var values = sheet.getRange(2, 1, lastRow - 1, CONFIG.TOTAL_COLUMNS).getValues();

  // map + กรองแถวที่ใช้ไม่ได้ (reuse mapSheetRowToPayload_ / toDate_ จาก Code.gs)
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var p = mapSheetRowToPayload_(values[i]);
    if (!p.parkingLocation) continue;          // ข้ามแถวว่าง
    var dt = toDate_(p.submittedAt);
    if (!dt) continue;                         // ข้ามแถวไม่มี timestamp
    if (carparkIsNoise_(p.note)) continue;     // ข้ามขยะ/แถวทดสอบ
    rows.push({ p: p, ts: dt });
  }
  if (!rows.length) return { error: "ไม่มีข้อมูลที่ใช้ได้" };

  rows.sort(function (a, b) { return b.ts - a.ts; });   // ใหม่สุดอยู่บน
  var latest = rows[0];

  // ชั้นของการจอดคอนโดครั้งล่าสุด (เผื่อรายการล่าสุดเป็นที่อื่นที่ไม่บันทึกชั้น)
  var latestCondo = null;
  for (var j = 0; j < rows.length; j++) {
    var fp = rows[j].p;
    if (fp.parkingLocation === "คอนโด" && fp.parkingFloor && fp.parkingFloor !== "-") {
      latestCondo = rows[j];
      break;
    }
  }

  var lp = latest.p;
  var hasFloor = lp.parkingFloor && lp.parkingFloor !== "-";
  var when = carparkFmt_(latest.ts, "d/MM/yyyy HH:mm");

  // ประโยคสรุปสำเร็จรูป — AI อ่านช่อง summary ช่องเดียวก็ตอบได้เลย
  var summary;
  if (lp.parkingLocation === "คอนโด" && hasFloor) {
    summary = "ตอนนี้รถจอดที่ คอนโด ชั้น " + lp.parkingFloor + " (" + when + ")";
  } else {
    summary = "ล่าสุดจอดที่ " + lp.parkingLocation + " (" + when + ")" +
      (hasFloor ? " ชั้น " + lp.parkingFloor : " — ที่นี่ไม่บันทึกชั้น");
    if (latestCondo) {
      summary += " | คอนโดครั้งล่าสุด: ชั้น " + latestCondo.p.parkingFloor +
        " (" + carparkFmt_(latestCondo.ts, "d/MM/yyyy HH:mm") + ")";
    }
  }

  return {
    updated: carparkFmt_(new Date(), "yyyy-MM-dd'T'HH:mm:ss") + "+07:00", // เวลาที่เรียก endpoint
    summary: summary,
    current: {
      location:   lp.parkingLocation,
      floor:      hasFloor ? lp.parkingFloor : "",
      time:       lp.displayTime || carparkFmt_(latest.ts, "HH:mm"),
      note:       lp.note || "",
      status:     lp.noteType || "",
      mapUrl:     lp.parkingMap || "",
      recordedAt: carparkFmt_(latest.ts, "yyyy-MM-dd'T'HH:mm:ss") + "+07:00"
    },
    latestCondo: latestCondo ? {
      floor:      latestCondo.p.parkingFloor,
      mapUrl:     latestCondo.p.parkingMap || "",
      recordedAt: carparkFmt_(latestCondo.ts, "yyyy-MM-dd'T'HH:mm:ss") + "+07:00"
    } : null,
    totalRecords: rows.length
  };
}

/** กรองโน้ตขยะ + แถวทดสอบ (ให้ผลตรงกับ dashboard) */
function carparkIsNoise_(note) {
  var n = String(note || "").toLowerCase();
  return n.indexOf("welcome to gboard") > -1 ||
         n.indexOf("touch and hold") > -1 ||
         n.indexOf("unpinned clips") > -1 ||
         n.indexOf("test") > -1 ||
         n.indexOf("ทดสอบ") > -1 ||
         n.indexOf("ทดลอง") > -1;
}

/** format วันที่ตาม timezone ของโปรเจกต์ */
function carparkFmt_(d, pattern) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, pattern);
}

/**
 * ════════════════════════════════════════════════════════════
 *  วิธี deploy (ทำครั้งเดียว)
 * ════════════════════════════════════════════════════════════
 *  1. ในโปรเจกต์ Apps Script เดิม → กดปุ่ม + ข้างคำว่า "Files"
 *     → เลือก "Script" → ตั้งชื่อ "CarparkStatus" → วางโค้ดนี้ → Save
 *     (อย่าแตะ Code.gs)
 *
 *  2. กด Deploy → New deployment → เลือกชนิด "Web app"
 *       • Description:     carpark status
 *       • Execute as:      Me
 *       • Who has access:  Anyone        ← ต้องเป็น Anyone ถึงให้ AI อ่านได้
 *                          ถ้า dropdown มีแต่ "Anyone within thaimooc.ac.th"
 *                          แปลว่าแอดมินองค์กรปิดไว้ — แจ้งกลับมาได้
 *
 *  3. กด Authorize access → อนุญาตสิทธิ์ (ครั้งแรกครั้งเดียว)
 *
 *  4. ก๊อป URL ที่ลงท้าย /exec → เปิดใน browser เช็คว่าได้ JSON
 *
 *  * แก้โค้ดทีหลัง: Deploy → Manage deployments → Edit (ดินสอ)
 *    → Version: New version → Deploy  (ไม่งั้น URL เดิมยังรันโค้ดเก่า)
 *
 *  หมายเหตุ: web app deployment แยกขาดจาก trigger เดิม —
 *  syncParkingRows / retryFailedLineNotifications / onChange ทำงานต่อปกติ
 * ════════════════════════════════════════════════════════════
 */
