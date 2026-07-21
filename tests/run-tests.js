/* run-tests.js — รันด้วย: node tests/run-tests.js
 * เทียบผลคำนวณกับตัวอย่างจากเอกสารกรมสรรพากร/แหล่งอ้างอิงมาตรฐาน */
const { DEFAULT_TAX_CONFIG: CFG } = require("../js/config.js");
const E = require("../js/engine.js");

let pass = 0, fail = 0;
function eq(name, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name + "  got=" + got + " want=" + want); }
}
function truthy(name, v) { v ? (pass++, console.log("  ✓ " + name)) : (fail++, console.error("  ✗ " + name)); }

const cit = E.pickVersion(CFG.citVersions, "2026-07-21");

console.log("\n[1] CIT — SME อัตราขั้นบันได (อ้างอิง rd.go.th/841.html)");
// ตัวอย่างมาตรฐาน: กำไร 5,000,000 → ยกเว้น 300,000 + 15% ของ 2,700,000 (405,000) + 20% ของ 2,000,000 (400,000)
eq("SME กำไร 5,000,000 → ภาษี 805,000", E.calcCIT(5000000, true, cit).tax, 805000);
eq("SME กำไร 300,000 → ยกเว้นทั้งจำนวน", E.calcCIT(300000, true, cit).tax, 0);
eq("SME กำไร 500,000 → 30,000 (200,000×15%)", E.calcCIT(500000, true, cit).tax, 30000);
eq("SME กำไร 3,000,000 → 405,000", E.calcCIT(3000000, true, cit).tax, 405000);
eq("บริษัททั่วไป กำไร 5,000,000 → 1,000,000 (20%)", E.calcCIT(5000000, false, cit).tax, 1000000);
eq("ขาดทุน → ภาษี 0", E.calcCIT(-100000, true, cit).tax, 0);

console.log("\n[2] เงื่อนไข SME — ต้องเข้าทั้งสองข้อ");
truthy("ทุน 5M + รายได้ 30M = SME", E.isSME({ paidUpCapital: 5000000, annualRevenue: 30000000 }, cit));
truthy("ทุน 5M + รายได้ 31M = ไม่ใช่ SME", !E.isSME({ paidUpCapital: 5000000, annualRevenue: 31000000 }, cit));
truthy("ทุน 6M + รายได้ 10M = ไม่ใช่ SME", !E.isSME({ paidUpCapital: 6000000, annualRevenue: 10000000 }, cit));

console.log("\n[3] ปรับกำไร + ขาดทุนยกมา (ม.65 ตรี(12) ไม่เกิน 5 รอบบัญชี)");
const adj = E.adjustProfit({
  accountingProfit: 1000000,
  addbacks: [{ label: "ค่ารับรองเกิน", amount: 50000 }, { label: "ค่าปรับ", amount: 10000 }],
  deductions: [{ label: "เงินปันผลยกเว้น", amount: 60000 }],
  currentPeriodEnd: "2026-12-31",
  lossCarryItems: [
    { periodEndDate: "2020-12-31", remaining: 400000 },  // เกิน 5 รอบ → หมดอายุ
    { periodEndDate: "2022-12-31", remaining: 300000 }   // ใช้ได้
  ]
}, cit);
eq("กำไรก่อนหักขาดทุน 1,000,000", adj.profitBeforeLoss, 1000000);
eq("ขาดทุนที่ใช้ได้ 300,000 (ปี 2020 หมดอายุ)", adj.lossUsed, 300000);
truthy("ขาดทุนปี 2020 ถูกตัดเป็นหมดอายุ", adj.lossExpired.length === 1 && adj.lossExpired[0].periodEndDate === "2020-12-31");
eq("กำไรสุทธิทางภาษี 700,000", adj.taxProfit, 700000);

console.log("\n[4] ภ.ง.ด.51 + เงินเพิ่ม ม.67 ตรี (ประมาณการขาดเกิน 25% → เงินเพิ่ม 20%)");
const p51 = E.calcPND51({ estimatedAnnualTaxProfit: 1000000, referenceActualProfit: 1000000, whtCreditHalfYear: 0, sme: false }, cit);
eq("ประมาณการ 1M ไม่ใช่ SME → ภาษีครึ่งปี 100,000", p51.tax, 100000);
truthy("ประมาณการเท่าอ้างอิง → ไม่เสี่ยง", p51.risk && !p51.risk.exceeds25);
const sc = E.calcPND51Surcharge({ actualAnnualTaxProfit: 1000000, estimatedAnnualTaxProfit: 600000, sme: false }, cit);
truthy("ประมาณการขาด 40% → เข้าเกณฑ์", sc.applies);
eq("ภาษีครึ่งปีที่ขาด 40,000", sc.shortTax, 40000);
eq("เงินเพิ่ม 20% = 8,000", sc.surcharge, 8000);
const sc2 = E.calcPND51Surcharge({ actualAnnualTaxProfit: 1000000, estimatedAnnualTaxProfit: 800000, sme: false }, cit);
truthy("ขาด 20% ไม่เกิน 25% → ไม่มีเงินเพิ่ม", !sc2.applies);

console.log("\n[5] ภ.ง.ด.50 หักเครดิตครึ่งปี");
const p50 = E.calcPND50({ accountingProfit: 2000000, currentPeriodEnd: "2026-12-31",
  addbacks: [], deductions: [], lossCarryItems: [], pnd51Paid: 100000, whtCredit: 20000, sme: false }, cit);
eq("ภาษีทั้งปี 400,000", p50.tax, 400000);
eq("ชำระเพิ่ม 280,000", p50.payable, 280000);

console.log("\n[6] WHT — อัตราตาม ท.ป.4/2528");
eq("ค่าบริการ 100,000 × 3% = 3,000", E.calcWHT("service", 100000, CFG).tax, 3000);
eq("ค่าเช่า 50,000 × 5% = 2,500", E.calcWHT("rent", 50000, CFG).tax, 2500);
eq("ค่าโฆษณา 20,000 × 2% = 400", E.calcWHT("advertising", 20000, CFG).tax, 400);
eq("ค่าขนส่ง 10,000 × 1% = 100", E.calcWHT("transport", 10000, CFG).tax, 100);
eq("เงินปันผล 100,000 × 10% = 10,000", E.calcWHT("dividend", 100000, CFG).tax, 10000);
eq("จ่ายต่ำกว่า 1,000 ไม่หัก", E.calcWHT("service", 999, CFG).tax, 0);

console.log("\n[7] ภ.ง.ด.1 เงินเดือน (วิธีมาตรฐาน)");
// เงินเดือน 30,000×12=360,000 − ค่าใช้จ่าย 100,000 (50% cap) − ลดหย่อน 60,000 = 200,000
// ภาษี: 150,000 แรกยกเว้น + 50,000×5% = 2,500/ปี → 208.33/เดือน
const pnd1 = E.calcPND1Withholding({ monthlySalary: 30000, periodsPerYear: 12, date: "2026-01-01" }, CFG);
eq("เงินได้สุทธิ 200,000", pnd1.netIncome, 200000);
eq("ภาษีทั้งปี 2,500", pnd1.annualTax, 2500);
eq("หักต่องวด 208.33", pnd1.withholdingPerPeriod, 208.33);
const pnd1b = E.calcPND1Withholding({ monthlySalary: 100000, periodsPerYear: 12, date: "2026-01-01" }, CFG);
// 1,200,000 − 100,000 − 60,000 = 1,040,000 → 7,500+20,000+37,500+50,000+40,000×25%(10,000) = 125,000
eq("เงินเดือน 100,000 → ภาษีปี 125,000", pnd1b.annualTax, 125000);

console.log("\n[8] VAT — อัตราตามวันที่ (7% ถึง 30 ก.ย. 2569 ตาม พ.ร.ฎ.799)");
eq("2026-07-21 → 7%", E.getVatRate("2026-07-21", CFG).ratePct, 7);
eq("2026-09-30 → 7%", E.getVatRate("2026-09-30", CFG).ratePct, 7);
eq("2026-10-01 → 10% (ตามกฎหมาย หากไม่มี พ.ร.ฎ. ใหม่)", E.getVatRate("2026-10-01", CFG).ratePct, 10);

console.log("\n[9] ภ.พ.30 ระดับใบกำกับ");
const pp30 = E.calcPP30({
  invoices: [
    { type: "sale", date: "2026-07-01", base: 1000000, vat: 70000, no: "S1" },
    { type: "purchase", date: "2026-07-05", base: 600000, vat: 42000, no: "P1" },
    { type: "purchase", date: "2026-07-06", base: 10000, vat: 700, no: "P2", disallowed: true }
  ], broughtForwardCredit: 0
}, CFG);
eq("ภาษีขาย 70,000", pp30.outputVat, 70000);
eq("ภาษีซื้อเครดิตได้ 42,000 (ไม่รวมต้องห้าม)", pp30.inputVat, 42000);
eq("ต้องชำระ 28,000", pp30.taxPayable, 28000);
const pp30b = E.calcPP30({ invoices: [
  { type: "sale", date: "2026-07-01", base: 100000, vat: 7000 },
  { type: "purchase", date: "2026-07-02", base: 200000, vat: 14000 }], broughtForwardCredit: 0 }, CFG);
eq("ภาษีซื้อมากกว่า → เครดิตยกไป 7,000", pp30b.excessCredit, 7000);
truthy("คำนวณ VAT อัตโนมัติเมื่อไม่กรอก", Math.abs(E.calcPP30({ invoices: [{ type: "sale", date: "2026-07-01", base: 100 }] }, CFG).outputVat - 7) < 0.01);

console.log("\n[10] ค่าเสื่อมราคา (ตัวอย่าง: เครื่องจักร 500,000 ซื้อ 1 ธ.ค. ใช้ 31 วัน)");
// = 500,000 × 20% × 31/365 = 8,493.15 (ตัวอย่างจากแนววินิจฉัยกรมสรรพากร)
eq("ค่าเสื่อมปีแรก 8,493.15", E.round2(500000 * 0.20 * 31 / 365), 8493.15);

console.log("\n[11] เงินเพิ่ม 1.5%/เดือน (เศษเดือนนับเป็น 1 เดือน, เพดานเท่าภาษี)");
eq("ครบกำหนด 15 พ.ค. ชำระ 1 ก.ค. = 2 เดือน", E.monthsLate("2026-05-15", "2026-07-01"), 2);
eq("ครบกำหนด 15 พ.ค. ชำระ 16 ก.ค. = 3 เดือน (เศษเดือน)", E.monthsLate("2026-05-15", "2026-07-16"), 3);
eq("ภาษี 10,000 ล่าช้า 2 เดือน → เงินเพิ่ม 300", E.calcSurcharge(10000, "2026-05-15", "2026-07-01", CFG).surcharge, 300);
truthy("เพดาน: ล่าช้า 10 ปี ไม่เกินจำนวนภาษี", E.calcSurcharge(10000, "2016-05-15", "2026-07-01", CFG).surcharge === 10000);

console.log("\n[12] เบี้ยปรับ ภ.พ.30 (ท.ป.81/2542: 2 เท่า ลดเหลือ 2/5/10/20%)");
let v = E.calcVatLatePenalty(10000, "2026-06-15", "2026-06-25", CFG); // 10 วัน
eq("ล่าช้า 10 วัน → เบี้ยปรับ 400 (2×10,000×2%)", v.civilPenalty, 400);
eq("ค่าปรับอาญาเกิน 7 วัน = 500", v.criminalFine, 500);
v = E.calcVatLatePenalty(10000, "2026-06-15", "2026-07-05", CFG); // 20 วัน
eq("ล่าช้า 20 วัน → เบี้ยปรับ 1,000 (2×10,000×5%)", v.civilPenalty, 1000);
v = E.calcVatLatePenalty(10000, "2026-06-15", "2026-09-15", CFG); // 92 วัน
eq("ล่าช้า >60 วัน → เบี้ยปรับ 4,000 (2×10,000×20%)", v.civilPenalty, 4000);
v = E.calcVatLatePenalty(10000, "2026-06-15", "2026-06-20", CFG); // 5 วัน
eq("ล่าช้า ≤7 วัน → ค่าปรับอาญา 300", v.criminalFine, 300);

console.log("\n[13] ปฏิทินกำหนดเวลา (รอบบัญชีสิ้น 31 ธ.ค.)");
const dl = E.buildDeadlines({ vatRegistered: true, fiscalYearEndMonth: 12, fiscalYearEndDay: 31 },
  "2026-01-01", "2026-12-31", CFG);
const p50d = dl.find((d) => d.form === "ภ.ง.ด.50");
const p51d = dl.find((d) => d.form === "ภ.ง.ด.51");
truthy("ภ.ง.ด.50 ครบกำหนด 30 พ.ค. (150 วันหลัง 31 ธ.ค.)", p50d && p50d.due === "2026-05-30");
truthy("ภ.ง.ด.50 ยื่นออนไลน์ +8 วัน = 7 มิ.ย.", p50d && p50d.dueEfiling === "2026-06-07");
truthy("ภ.ง.ด.51 ครบกำหนด 31 ส.ค. (2 เดือนหลัง 30 มิ.ย.)", p51d && p51d.due === "2026-08-31");
const whtJul = dl.find((d) => d.kind === "WHT" && d.due === "2026-07-07");
truthy("WHT เดือน มิ.ย. ครบกำหนด 7 ก.ค.", !!whtJul);
const vatJul = dl.find((d) => d.kind === "VAT" && d.due === "2026-07-15");
truthy("ภ.พ.30 เดือน มิ.ย. ครบกำหนด 15 ก.ค. (+8 = 23 ก.ค.)", vatJul && vatJul.dueEfiling === "2026-07-23");

console.log("\n[14] การปัดเศษสตางค์");
eq("round2(0.005) → 0.01", E.round2(0.005), 0.01);
eq("round2(123.456) → 123.46", E.round2(123.456), 123.46);
eq("3% ของ 33.33 = 1.00", E.round2(33.33 * 0.03), 1.00);

console.log("\n================================");
console.log("ผ่าน " + pass + " / " + (pass + fail) + " รายการ" + (fail ? "  ❌ ล้มเหลว " + fail : "  ✅"));
process.exit(fail ? 1 : 0);
