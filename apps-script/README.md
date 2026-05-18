# Carpark Live Status — AI-readable endpoint

ทำให้ AI (Claude / ChatGPT / Gemini) ตอบคำถามอย่าง *"ตอนนี้รถจอดอยู่ชั้นไหน"* ได้
โดยอ่านสถานะที่จอดรถล่าสุดจากไฟล์ static บน GitHub Pages

## Pipeline

```
Framer form ──▶ Google Sheets ──▶ Apps Script web app ──▶ GitHub Action ──▶ GitHub Pages ──▶ AI
              (Sheet1)         (CarparkStatus.gs:        (carpark-status.yml:  status.txt
                                คำนวณ summary)            ดึงทุก ~10 นาที)      status.json
```

ทำไมต้องมี GitHub Action เป็นตัวกลาง: Apps Script web app (`script.google.com`) มี
redirect ไปยัง `googleusercontent.com` ซึ่ง AI บางตัว (เช่น Gemini) ตามไม่ได้ —
จึงต้อง mirror ผลลัพธ์ไปเป็นไฟล์ static ที่เปิดตรงไม่มี redirect

## URLs

| ใช้ทำอะไร | URL |
|---|---|
| **ถาม AI** (ข้อความล้วน บรรทัดเดียว) | `https://natpakans-stack.github.io/carpark-live-dashboard/status.txt` |
| ข้อมูลแบบ JSON เต็ม | `https://natpakans-stack.github.io/carpark-live-dashboard/status.json` |
| Apps Script web app (ต้นทาง) | `.../macros/s/AKfycbx…6Xq5I6xCG8h6pHw/exec` |

## วิธีใช้ — ถาม AI

วาง prompt นี้:

```
เปิดลิงก์นี้แล้วบอกข้อความที่อยู่ข้างใน:
https://natpakans-stack.github.io/carpark-live-dashboard/status.txt
```

- **Claude / ChatGPT** — อ่านได้ 100%
- **Gemini** — เป็น static `.txt` ไม่มี redirect → อ่านได้ (ถ้า Gemini รุ่นนั้นเปิด URL ได้)

## ส่วนประกอบ

### 1. `CarparkStatus.gs` — Apps Script web app
- เพิ่มเป็น **ไฟล์แยก** ในโปรเจกต์ Apps Script `parkingReminder` (ไม่แตะ `Code.gs`)
- ใช้ `CONFIG`, `mapSheetRowToPayload_`, `toDate_` ของ `Code.gs` ร่วมกัน
- อ่านชีต `Sheet1` สดทุกครั้งที่ถูกเรียก → คืน JSON ที่มีช่อง `summary` สำเร็จรูป
- read อย่างเดียว ไม่เขียนทับชีต
- **แก้โค้ดแล้วต้อง redeploy:** Deploy → Manage deployments → Edit → Version: New version → Deploy
  (ไม่งั้น URL `/exec` เดิมยังรันโค้ดเก่า)

### 2. `.github/workflows/carpark-status.yml` — GitHub Action
- รันทุก ~10 นาที (cron) + กดรันเองได้ที่แท็บ Actions → Run workflow
- `curl` Apps Script endpoint → เขียน `status.txt` / `status.json`
- publish ลง branch `gh-pages` ด้วย `keep_files: true` (ไม่ลบไฟล์ dashboard)

### 3. `status.txt` / `status.json` — ผลลัพธ์บน `gh-pages`
- สร้าง/อัปเดตโดย Action เท่านั้น — ไม่ต้องแก้มือ

## โครงสร้าง JSON (`status.json`)

```json
{
  "updated":     "เวลาที่ Action ดึงข้อมูล",
  "summary":     "ประโยคสรุปสำเร็จรูป — AI อ่านช่องนี้ช่องเดียวพอ",
  "current":     { "location", "floor", "time", "note", "status", "mapUrl", "recordedAt" },
  "latestCondo": { "floor", "mapUrl", "recordedAt" },
  "totalRecords": 88
}
```

## การดูแล

| งาน | วิธีทำ |
|---|---|
| ดูข้อมูลล่าสุดทันที | กดรัน workflow เอง: แท็บ **Actions → Carpark status → Run workflow** |
| แก้ logic การคำนวณ | แก้ `CarparkStatus.gs` → **redeploy new version** ใน Apps Script |
| เปลี่ยนความถี่อัปเดต | แก้ `cron` ใน `carpark-status.yml` |
| deploy dashboard | `npm run deploy` (ใช้ `--add` แล้ว — ไม่ลบไฟล์ status) |

## ข้อจำกัด

- **Lag ~10–20 นาที** — GitHub cron ไม่ตรงเวลาเป๊ะ
- ถ้า Apps Script endpoint ล่ม → Action จะ fail และ **ไม่** เขียนทับไฟล์เดิม (กันไฟล์พัง)
- `peaceiris/actions-gh-pages` รันบน Node 20 ที่จะ deprecate มิ.ย. 2026 — ไว้อัปเดตเวอร์ชันภายหลัง
