/* =====================================================================
 * config.js — ตารางอัตราภาษีแบบ versioned (มี effective date)
 * ห้าม hardcode อัตราใน engine — engine ต้องเรียกผ่าน getConfigFor(date)
 * ที่มา (ตรวจสอบ 21 ก.ค. 2569):
 *  - CIT/SME:   https://www.rd.go.th/841.html
 *  - VAT 7%:    พ.ร.ฎ.(ฉบับที่ 799) ต่ออายุถึง 30 ก.ย. 2569  https://www.rd.go.th/35772.html
 *  - เบี้ยปรับ/เงินเพิ่ม: ท.ป.81/2542  https://www.rd.go.th/3361.html
 *  - e-Filing +8 วัน: ประกาศกระทรวงการคลัง มีผล 1 ก.พ. 2567 – 31 ม.ค. 2570
 * ผู้ใช้แก้ไข/เพิ่มเวอร์ชันได้จากหน้า "ตั้งค่า" (เก็บ override ใน localStorage)
 * ===================================================================== */

const DEFAULT_TAX_CONFIG = {
  meta: {
    configVersion: "2026.07.1",
    lastVerified: "2026-07-21",
    sources: [
      "https://www.rd.go.th/841.html",
      "https://www.rd.go.th/35772.html",
      "https://www.rd.go.th/3361.html",
      "https://www.rd.go.th/827.html",
      "https://efiling.rd.go.th/rd-cms/extend"
    ]
  },

  /* ---------- ภาษีเงินได้นิติบุคคล (versioned) ---------- */
  citVersions: [
    {
      effectiveFrom: "2015-01-01",
      effectiveTo: null, // ใช้จนกว่าจะมีเวอร์ชันใหม่
      standardRatePct: 20,
      sme: {
        // ต้องเข้าเงื่อนไข "ทั้งสองข้อ"
        paidUpCapitalMax: 5000000,
        revenueMax: 30000000,
        bracketsPct: [
          { upTo: 300000, ratePct: 0 },     // ยกเว้น
          { upTo: 3000000, ratePct: 15 },
          { upTo: null, ratePct: 20 }
        ]
      },
      lossCarryForwardPeriods: 5,           // ม.65 ตรี(12) ยกมาได้ไม่เกิน 5 รอบบัญชี
      halfYear: {
        underestimateThresholdPct: 25,      // ประมาณการขาดเกิน 25% โดยไม่มีเหตุอันสมควร
        surchargePctOfShortTax: 20          // เงินเพิ่ม 20% ของภาษีที่ชำระขาด (ม.67 ตรี)
      }
    }
  ],

  /* ---------- อัตราค่าเสื่อมราคาทางภาษี (พ.ร.ฎ. ฉบับที่ 145) ---------- */
  depreciationRates: [
    { key: "building", label: "อาคารถาวร", maxRatePct: 5 },
    { key: "building_temp", label: "อาคารชั่วคราว", maxRatePct: 100 },
    { key: "machinery", label: "เครื่องจักร/อุปกรณ์", maxRatePct: 20 },
    { key: "vehicle", label: "รถยนต์นั่ง/โดยสาร ≤10 ที่นั่ง (ฐานคำนวณไม่เกิน 1,000,000 บาท)", maxRatePct: 20, costCap: 1000000 },
    { key: "vehicle_other", label: "ยานพาหนะอื่น", maxRatePct: 20 },
    { key: "computer", label: "คอมพิวเตอร์/โปรแกรม", maxRatePct: 33.33 },
    { key: "goodwill_limited", label: "สิทธิ/goodwill แบบจำกัดอายุ", maxRatePct: 10 },
    { key: "other", label: "ทรัพย์สินอื่น", maxRatePct: 20 }
  ],

  /* ---------- สิทธิประโยชน์ SME (ตัวอย่างที่ใช้บ่อย — ตรวจสอบเงื่อนไขรายมาตรการ) ---------- */
  smeIncentives: [
    { key: "computer_init", label: "คอมพิวเตอร์: หักค่าเสื่อมเริ่มแรก 40% ของมูลค่า (ส่วนที่เหลือหักตามปกติ 3 รอบบัญชี)", note: "ทรัพย์สินถาวรรวมไม่เกิน 200 ล้าน + จ้างงานไม่เกิน 200 คน" },
    { key: "factory_init", label: "อาคารโรงงาน: หักค่าเสื่อมเริ่มแรก 25%", note: "เงื่อนไขเดียวกัน" },
    { key: "machine_init", label: "เครื่องจักร: หักค่าเสื่อมเริ่มแรก 40%", note: "เงื่อนไขเดียวกัน" }
  ],

  /* ---------- VAT (versioned) ---------- */
  vatVersions: [
    {
      effectiveFrom: "1999-04-01",
      effectiveTo: "2026-09-30",
      ratePct: 7,
      note: "อัตราลดตาม พ.ร.ฎ. (ล่าสุดฉบับที่ 799 ต่ออายุ 1 ต.ค. 2568 – 30 ก.ย. 2569)"
    },
    {
      effectiveFrom: "2026-10-01",
      effectiveTo: null,
      ratePct: 10,
      note: "อัตราตามมาตรา 80 แห่งประมวลรัษฎากร — ที่ผ่านมามี พ.ร.ฎ. ลดเหลือ 7% ต่ออายุทุกปี โปรดตรวจสอบประกาศใหม่ก่อนใช้"
    }
  ],
  vatRegistrationThreshold: 1800000, // รายรับเกิน 1.8 ล้านบาท/ปี ต้องจด VAT

  /* ---------- ภาษีหัก ณ ที่จ่าย ---------- */
  whtTypes: [
    { key: "service", label: "ค่าบริการ/ค่าจ้างทำของ", ratePct: 3, forms: ["PND3", "PND53"], section: "ท.ป.4/2528 ข้อ 8" },
    { key: "professional", label: "ค่าวิชาชีพอิสระ (บัญชี กฎหมาย ฯลฯ)", ratePct: 3, forms: ["PND3", "PND53"], section: "ม.3 เตรส" },
    { key: "rent", label: "ค่าเช่าทรัพย์สิน", ratePct: 5, forms: ["PND3", "PND53"], section: "ท.ป.4/2528 ข้อ 6" },
    { key: "advertising", label: "ค่าโฆษณา", ratePct: 2, forms: ["PND3", "PND53"], section: "ท.ป.4/2528 ข้อ 10" },
    { key: "transport", label: "ค่าขนส่ง (ไม่ใช่ขนส่งสาธารณะ)", ratePct: 1, forms: ["PND3", "PND53"], section: "ท.ป.4/2528 ข้อ 12/4" },
    { key: "insurance", label: "ค่าเบี้ยประกันวินาศภัย", ratePct: 1, forms: ["PND53"], section: "ท.ป.4/2528" },
    { key: "dividend", label: "เงินปันผล/ส่วนแบ่งกำไร", ratePct: 10, forms: ["PND2", "PND53"], section: "ม.50(2), ม.3 เตรส" },
    { key: "interest", label: "ดอกเบี้ย (จ่ายให้นิติบุคคลทั่วไป)", ratePct: 1, forms: ["PND53"], section: "ท.ป.4/2528 ข้อ 4" },
    { key: "prize", label: "รางวัลจากการประกวด/แข่งขัน/ชิงโชค", ratePct: 5, forms: ["PND3", "PND53"], section: "ท.ป.4/2528 ข้อ 9" },
    { key: "salary", label: "เงินเดือน/ค่าจ้าง (พนักงาน)", ratePct: null, forms: ["PND1"], section: "ม.50(1) — คำนวณตามอัตราก้าวหน้า" }
  ],
  whtMinAmount: 1000, // จ่ายไม่ถึง 1,000 บาท ไม่ต้องหัก (เว้นสัญญาต่อเนื่อง)

  /* ---------- อัตราภาษีเงินได้บุคคลธรรมดา (ใช้คำนวณ ภ.ง.ด.1) ---------- */
  pitVersions: [
    {
      effectiveFrom: "2017-01-01",
      effectiveTo: null,
      bracketsPct: [
        { upTo: 150000, ratePct: 0 },
        { upTo: 300000, ratePct: 5 },
        { upTo: 500000, ratePct: 10 },
        { upTo: 750000, ratePct: 15 },
        { upTo: 1000000, ratePct: 20 },
        { upTo: 2000000, ratePct: 25 },
        { upTo: 5000000, ratePct: 30 },
        { upTo: null, ratePct: 35 }
      ],
      expenseDeductionPct: 50, expenseDeductionCap: 100000,
      personalAllowance: 60000
    }
  ],

  /* ---------- เบี้ยปรับ/เงินเพิ่ม ---------- */
  penalties: {
    surchargeMonthlyPct: 1.5,          // เงินเพิ่ม 1.5%/เดือน (เศษเดือนนับเป็น 1 เดือน)
    surchargeCapPct: 100,              // เพดานไม่เกินจำนวนภาษี
    pnd51SurchargePct: 20,             // ภ.ง.ด.51 ยื่นขาด/ประมาณการขาดเกิน 25%
    vat: {
      civilPenaltyMultiplier: 2,       // เบี้ยปรับ 2 เท่า กรณีไม่ยื่น ภ.พ.30
      // ลดเบี้ยปรับตาม ท.ป.81/2542 (ยื่นเองโดยไม่ถูกตรวจพบ)
      reductionSchedule: [
        { daysMax: 15, payPctOfPenalty: 2 },
        { daysMax: 30, payPctOfPenalty: 5 },
        { daysMax: 60, payPctOfPenalty: 10 },
        { daysMax: null, payPctOfPenalty: 20 }
      ],
      criminalFine: { within7Days: 300, after7Days: 500 }
    },
    incomeTax: {
      criminalFine: { within7Days: 100, after7Days: 200, maxByLaw: 2000 } // แนวปฏิบัติเปรียบเทียบปรับ / เพดาน ม.35
    }
  },

  /* ---------- กำหนดเวลายื่น ---------- */
  deadlines: {
    whtDayOfNextMonth: 7,          // ภ.ง.ด.1/2/3/53 ภายในวันที่ 7 เดือนถัดไป (ยื่นกระดาษ)
    vatDayOfNextMonth: 15,         // ภ.พ.30 ภายในวันที่ 15 เดือนถัดไป
    pnd51MonthsAfterHalfYear: 2,   // ภายใน 2 เดือนนับจากวันสุดท้ายของ 6 เดือนแรก
    pnd50DaysAfterYearEnd: 150,    // ภายใน 150 วันนับแต่วันสิ้นรอบบัญชี
    efiling: {
      extensionDays: 8,            // ยื่นออนไลน์ได้สิทธิ +8 วัน
      validFrom: "2024-02-01",
      validTo: "2027-01-31"
    }
  },

  /* ---------- รายจ่ายต้องห้ามที่พบบ่อย (ม.65 ตรี) — ใช้เป็น checklist ---------- */
  disallowedExpenseTypes: [
    { key: "personal", label: "รายจ่ายส่วนตัว/การกุศลเกินเกณฑ์ (ม.65 ตรี(3))" },
    { key: "entertainment_excess", label: "ค่ารับรองส่วนที่เกิน 0.3% ของรายได้/ทุน (สูงสุด 10 ล้าน) (ม.65 ตรี(4))" },
    { key: "capital", label: "รายจ่ายฝ่ายทุน/ต่อเติมทรัพย์สิน (ม.65 ตรี(5))" },
    { key: "fine", label: "เบี้ยปรับ เงินเพิ่ม ค่าปรับอาญา ภาษีเงินได้ของบริษัท (ม.65 ตรี(6))" },
    { key: "reserve", label: "เงินสำรองต่างๆ (ม.65 ตรี(1))" },
    { key: "no_payee", label: "รายจ่ายพิสูจน์ผู้รับไม่ได้ (ม.65 ตรี(18))" },
    { key: "no_invoice", label: "รายจ่ายไม่มีหลักฐาน/บิลเงินสดใช้ไม่ได้" },
    { key: "unrelated", label: "รายจ่ายไม่เกี่ยวกับกิจการ (ม.65 ตรี(13))" },
    { key: "other", label: "อื่นๆ" }
  ]
};

/* node.js export สำหรับรัน test */
if (typeof module !== "undefined") module.exports = { DEFAULT_TAX_CONFIG };
