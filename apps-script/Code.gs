/**
 * Carpark Live Status — Google Apps Script Web App
 * ─────────────────────────────────────────────────
 * อ่านชีตสด "ทุกครั้ง" ที่ถูกเรียก แล้วคืนสถานะที่จอดรถล่าสุด
 * ไม่ใช่ snapshot — ข้อมูลใหม่เสมอ
 *
 * Endpoint:
 *   GET  .../exec               → JSON เต็ม
 *   GET  .../exec?format=text   → ข้อความบรรทัดเดียว (ช่อง summary)
 *
 * วิธี deploy:
 *   1. เปิด Google Sheet ที่เก็บข้อมูล → เมนู Extensions → Apps Script
 *   2. วางโค้ดนี้แทนของเดิมทั้งหมด → กด Save (ไอคอนแผ่นดิสก์)
 *   3. กด Deploy → New deployment → เลือกชนิด "Web app"
 *        • Execute as:      Me
 *        • Who has access:  Anyone           ← ต้องเป็น Anyone ถึงจะให้ AI อ่านได้
 *   4. กด Authorize access → อนุญาตสิทธิ์ (ครั้งแรกเท่านั้น)
 *   5. ก๊อป URL ที่ลงท้ายด้วย /exec → เอาไปใช้
 *   * แก้โค้ดทีหลัง: ต้อง Deploy → Manage deployments → Edit → เวอร์ชันใหม่ทุกครั้ง
 */

// ── ตั้งค่า ──
var SHEET_INDEX = 0;       // ชีตแรก (gid=0) — ถ้าข้อมูลอยู่แท็บอื่น เปลี่ยนเป็น
                           // SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ชื่อแท็บ')
var TZ = 'Asia/Bangkok';

function doGet(e) {
  var data = buildStatus();
  if (e && e.parameter && e.parameter.format === 'text') {
    return ContentService
      .createTextOutput(data.summary || data.error || '')
      .setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildStatus() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[SHEET_INDEX];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { error: 'no data' };

  // header → index (trim + lowercase กันชื่อคอลัมน์มีช่องว่าง/ตัวพิมพ์ใหญ่)
  var header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  function col(name) { return header.indexOf(name.toLowerCase()); }
  var iDate = col('Date'),
      iFloor = col('parkingFloor'),
      iNote = col('note'),
      iLoc = col('parkingLocation'),
      iMap = col('parkingMap'),
      iExit = col('exitDateReminder'),
      iType = col('NoteType'),
      iTime = col('timeForgot');

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var loc = String(row[iLoc] || '').trim();
    var note = String(row[iNote] || '').trim();
    var ts = row[iDate];
    if (!loc || !ts) continue;                 // ข้ามแถวว่าง
    if (isJunk(note) || isTest(note)) continue; // ข้ามขยะ/แถวทดสอบ
    var dt = (ts instanceof Date) ? ts : new Date(ts);
    if (isNaN(dt.getTime())) continue;
    rows.push({
      ts: dt,
      location: loc,
      floor: String(row[iFloor] || '').trim(),
      note: note,
      mapUrl: String(row[iMap] || '').trim(),
      exitDate: fmtDate(row[iExit]),
      time: fmtTime(row[iTime]),
      status: String(row[iType] || '').trim()
    });
  }
  if (!rows.length) return { error: 'no valid rows' };

  rows.sort(function (a, b) { return b.ts - a.ts; }); // ใหม่สุดอยู่บน
  var latest = rows[0];

  // ชั้นของการจอดคอนโดครั้งล่าสุด (เผื่อรายการล่าสุดเป็นที่อื่นที่ไม่บันทึกชั้น)
  var latestCondo = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].location === 'คอนโด' && rows[i].floor && rows[i].floor !== '-') {
      latestCondo = rows[i];
      break;
    }
  }

  // ประโยคสรุปสำเร็จรูป — AI อ่านช่องนี้ช่องเดียวก็ตอบได้เลย
  var summary;
  if (latest.location === 'คอนโด' && latest.floor) {
    summary = 'ตอนนี้รถจอดที่ คอนโด ชั้น ' + latest.floor +
              ' (' + fmtThai(latest.ts) + ')';
  } else {
    summary = 'ล่าสุดจอดที่ ' + latest.location + ' (' + fmtThai(latest.ts) + ')' +
              (latest.floor ? ' ชั้น ' + latest.floor : ' — ที่นี่ไม่บันทึกชั้น');
    if (latestCondo) {
      summary += ' | คอนโดครั้งล่าสุด: ชั้น ' + latestCondo.floor +
                 ' (' + fmtThai(latestCondo.ts) + ')';
    }
  }

  return {
    updated: fmtIso(new Date()),     // เวลาที่เรียก endpoint นี้
    summary: summary,
    current: {
      location: latest.location,
      floor: latest.floor,
      time: latest.time,
      note: latest.note,
      status: latest.status,
      mapUrl: latest.mapUrl,
      recordedAt: fmtIso(latest.ts)  // เวลาที่บันทึกรายการล่าสุด
    },
    latestCondo: latestCondo ? {
      floor: latestCondo.floor,
      time: latestCondo.time,
      mapUrl: latestCondo.mapUrl,
      recordedAt: fmtIso(latestCondo.ts)
    } : null,
    totalRecords: rows.length
  };
}

// ── helpers ──
function isJunk(n) {
  n = n.toLowerCase();
  return n.indexOf('welcome to gboard') > -1 ||
         n.indexOf('touch and hold') > -1 ||
         n.indexOf('unpinned clips') > -1;
}
function isTest(n) {
  var l = n.toLowerCase();
  return l.indexOf('test') > -1 || n.indexOf('ทดสอบ') > -1 || n.indexOf('ทดลอง') > -1;
}
function fmtIso(d)  { return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss") + '+07:00'; }
function fmtThai(d) { return Utilities.formatDate(d, TZ, 'd/MM/yyyy HH:mm'); }
function fmtDate(v) {
  if (!v) return '';
  return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v).trim();
}
function fmtTime(v) {
  if (!v) return '';
  return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v).trim();
}
