/* =====================================================================
 * engine.js — pure calculation functions (ไม่มี DOM, รัน test ด้วย Node ได้)
 * ทุกฟังก์ชันรับ config เป็น parameter — ไม่อ่านอัตราจากค่าคงที่ในไฟล์นี้
 * การปัดเศษ: เก็บสตางค์ 2 ตำแหน่ง (ปัดครึ่งขึ้น) ตามแนวปฏิบัติแบบแสดงรายการ
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ---------- utilities ---------- */
  function round2(n) {
    // ปัดเศษสตางค์ 2 ตำแหน่ง แบบ half-up ป้องกัน floating point
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  function parseDate(d) { return (d instanceof Date) ? d : new Date(d + "T00:00:00"); }
  function fmtISO(d) {
    const p = (x) => String(x).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

  /* เลือกเวอร์ชัน config ตามวันที่ (effectiveFrom <= date <= effectiveTo) */
  function pickVersion(versions, dateISO) {
    const d = parseDate(dateISO).getTime();
    let best = null;
    for (const v of versions) {
      const from = parseDate(v.effectiveFrom).getTime();
      const to = v.effectiveTo ? parseDate(v.effectiveTo).getTime() : Infinity;
      if (d >= from && d <= to) {
        if (!best || from > parseDate(best.effectiveFrom).getTime()) best = v;
      }
    }
    return best;
  }

  /* ---------- ภาษีขั้นบันได ---------- */
  function progressiveTax(base, bracketsPct) {
    let tax = 0, prev = 0;
    const detail = [];
    for (const b of bracketsPct) {
      const cap = (b.upTo === null || b.upTo === undefined) ? Infinity : b.upTo;
      if (base > prev) {
        const slice = Math.min(base, cap) - prev;
        const t = slice * b.ratePct / 100;
        detail.push({ from: prev, to: Math.min(base, cap), ratePct: b.ratePct, tax: round2(t) });
        tax += t;
      }
      prev = cap;
      if (base <= cap) break;
    }
    return { tax: round2(tax), detail };
  }

  /* =====================================================================
   * 1) CIT — ภาษีเงินได้นิติบุคคล
   * ===================================================================== */

  /* ตรวจสถานะ SME: ต้องเข้าเงื่อนไขทั้งสองข้อ */
  function isSME(profile, citCfg) {
    return Number(profile.paidUpCapital) <= citCfg.sme.paidUpCapitalMax &&
           Number(profile.annualRevenue) <= citCfg.sme.revenueMax;
  }

  /* ปรับกำไรทางบัญชี -> กำไรสุทธิทางภาษี
   * input: { accountingProfit, addbacks:[{label,amount}], deductions:[{label,amount}],
   *          lossCarryItems:[{periodEndDate, remaining}], currentPeriodEnd }
   * ขาดทุนยกมา: ใช้ได้เฉพาะรอบบัญชีที่สิ้นสุดภายใน N รอบ (default 5) ก่อนรอบปัจจุบัน
   */
  function adjustProfit(input, citCfg) {
    const addback = (input.addbacks || []).reduce((s, x) => s + Number(x.amount || 0), 0);
    const deduct = (input.deductions || []).reduce((s, x) => s + Number(x.amount || 0), 0);
    let profitBeforeLoss = round2(Number(input.accountingProfit || 0) + addback - deduct);

    const maxPeriods = citCfg.lossCarryForwardPeriods;
    const curEnd = parseDate(input.currentPeriodEnd || fmtISO(new Date()));
    const usable = [], expired = [];
    for (const l of (input.lossCarryItems || [])) {
      const end = parseDate(l.periodEndDate);
      // ประมาณอายุเป็นจำนวนรอบบัญชี (ปี) — สิ้นรอบขาดทุน + 5 ปี ต้องไม่เกินสิ้นรอบปัจจุบัน
      const limit = new Date(end); limit.setFullYear(limit.getFullYear() + maxPeriods);
      if (curEnd <= limit) usable.push({ ...l }); else expired.push({ ...l });
    }
    usable.sort((a, b) => parseDate(a.periodEndDate) - parseDate(b.periodEndDate)); // FIFO

    let lossUsed = 0, remainProfit = Math.max(profitBeforeLoss, 0);
    for (const l of usable) {
      if (remainProfit <= 0) break;
      const use = Math.min(Number(l.remaining || 0), remainProfit);
      l.used = round2(use); lossUsed += use; remainProfit -= use;
    }
    const taxProfit = round2(Math.max(profitBeforeLoss - lossUsed, profitBeforeLoss < 0 ? profitBeforeLoss : 0));
    return {
      accountingProfit: round2(Number(input.accountingProfit || 0)),
      totalAddback: round2(addback),
      totalDeduction: round2(deduct),
      profitBeforeLoss,
      lossUsed: round2(lossUsed),
      lossExpired: expired,
      taxProfit: profitBeforeLoss <= 0 ? profitBeforeLoss : round2(Math.max(profitBeforeLoss - lossUsed, 0))
    };
  }

  /* คำนวณภาษีจากกำไรสุทธิทางภาษี */
  function calcCIT(taxProfit, sme, citCfg) {
    if (taxProfit <= 0) return { tax: 0, detail: [], sme, note: "ไม่มีกำไรสุทธิ ไม่ต้องเสียภาษี" };
    if (sme) {
      const r = progressiveTax(taxProfit, citCfg.sme.bracketsPct);
      return { tax: r.tax, detail: r.detail, sme: true };
    }
    return {
      tax: round2(taxProfit * citCfg.standardRatePct / 100),
      detail: [{ from: 0, to: taxProfit, ratePct: citCfg.standardRatePct, tax: round2(taxProfit * citCfg.standardRatePct / 100) }],
      sme: false
    };
  }

  /* ภ.ง.ด.51 — ครึ่งรอบบัญชี: ภาษีจากกึ่งหนึ่งของประมาณการกำไรทั้งปี */
  function calcPND51(input, citCfg) {
    const est = Number(input.estimatedAnnualTaxProfit || 0);
    const half = round2(est / 2);
    const sme = input.sme;
    const citRes = calcCIT(half, sme, citCfg);
    const whtCredit = Number(input.whtCreditHalfYear || 0);
    const payable = round2(Math.max(citRes.tax - whtCredit, 0));

    // ประเมินความเสี่ยง 25%: เทียบกับกำไรจริงปีก่อน (หรือค่าที่ผู้ใช้คาด)
    let risk = null;
    const ref = Number(input.referenceActualProfit || 0);
    if (ref > 0) {
      const shortPct = (ref - est) / ref * 100;
      risk = {
        referenceProfit: ref,
        estimatedProfit: est,
        shortfallPct: round2(shortPct),
        exceeds25: shortPct > citCfg.halfYear.underestimateThresholdPct,
        safeMinimumEstimate: round2(ref * (1 - citCfg.halfYear.underestimateThresholdPct / 100)),
        note: shortPct > citCfg.halfYear.underestimateThresholdPct
          ? "เสี่ยง! ประมาณการต่ำกว่ากำไรอ้างอิงเกิน " + citCfg.halfYear.underestimateThresholdPct + "% หากกำไรจริงสิ้นปีเป็นเช่นนี้และไม่มีเหตุอันสมควร จะเสียเงินเพิ่ม " + citCfg.halfYear.surchargePctOfShortTax + "% ของภาษีที่ชำระขาด (ม.67 ตรี)"
          : "ประมาณการอยู่ในเกณฑ์ปลอดภัยเมื่อเทียบกับกำไรอ้างอิง (แนวปฏิบัติ: ชำระภาษีครึ่งปีไม่น้อยกว่ากึ่งหนึ่งของปีก่อน)"
      };
    }
    return { halfProfit: half, tax: citRes.tax, detail: citRes.detail, whtCredit, payable, risk };
  }

  /* เงินเพิ่ม ม.67 ตรี กรณีสิ้นปีพบว่าประมาณการขาดเกิน 25% */
  function calcPND51Surcharge(input, citCfg) {
    const actual = Number(input.actualAnnualTaxProfit || 0);
    const est = Number(input.estimatedAnnualTaxProfit || 0);
    const shortPct = actual > 0 ? (actual - est) / actual * 100 : 0;
    if (shortPct <= citCfg.halfYear.underestimateThresholdPct) {
      return { applies: false, shortfallPct: round2(shortPct) };
    }
    const taxOnHalfActual = calcCIT(round2(actual / 2), input.sme, citCfg).tax;
    const taxOnHalfEst = calcCIT(round2(est / 2), input.sme, citCfg).tax;
    const shortTax = round2(Math.max(taxOnHalfActual - taxOnHalfEst, 0));
    return {
      applies: true, shortfallPct: round2(shortPct), shortTax,
      surcharge: round2(shortTax * citCfg.halfYear.surchargePctOfShortTax / 100)
    };
  }

  /* ภ.ง.ด.50 — สิ้นรอบบัญชี */
  function calcPND50(input, citCfg) {
    const adj = adjustProfit(input, citCfg);
    const sme = input.sme;
    const citRes = calcCIT(Math.max(adj.taxProfit, 0), sme, citCfg);
    const credits = round2(Number(input.pnd51Paid || 0) + Number(input.whtCredit || 0));
    const net = round2(citRes.tax - credits);
    return {
      adjustment: adj, tax: citRes.tax, detail: citRes.detail, sme,
      pnd51Paid: round2(Number(input.pnd51Paid || 0)),
      whtCredit: round2(Number(input.whtCredit || 0)),
      payable: net > 0 ? net : 0,
      refundable: net < 0 ? round2(-net) : 0
    };
  }

  /* =====================================================================
   * 2) WHT — ภาษีหัก ณ ที่จ่าย
   * ===================================================================== */
  function calcWHT(typeKey, amount, cfg) {
    const t = cfg.whtTypes.find((x) => x.key === typeKey);
    if (!t) throw new Error("ไม่รู้จักประเภท WHT: " + typeKey);
    if (t.ratePct === null) throw new Error("เงินเดือนใช้ calcPND1Withholding");
    const amt = Number(amount || 0);
    const below = amt < cfg.whtMinAmount;
    const tax = below ? 0 : round2(amt * t.ratePct / 100);
    return { type: t, amount: round2(amt), ratePct: t.ratePct, tax, netPay: round2(amt - tax), belowMinimum: below };
  }

  /* ภ.ง.ด.1: วิธีคำนวณหักเงินเดือนรายเดือนแบบมาตรฐาน (เงินได้ทั้งปี -> ภาษีทั้งปี / งวด) */
  function calcPND1Withholding(input, cfg) {
    const pit = pickVersion(cfg.pitVersions, input.date || fmtISO(new Date()));
    const perPeriod = Number(input.monthlySalary || 0);
    const periods = Number(input.periodsPerYear || 12);
    const annual = perPeriod * periods + Number(input.annualBonus || 0);
    const expense = Math.min(annual * pit.expenseDeductionPct / 100, pit.expenseDeductionCap);
    const allowances = pit.personalAllowance + Number(input.otherAllowances || 0);
    const net = Math.max(annual - expense - allowances, 0);
    const r = progressiveTax(net, pit.bracketsPct);
    const perPeriodTax = round2(r.tax / periods);
    return { annualIncome: round2(annual), expense: round2(expense), allowances: round2(allowances),
             netIncome: round2(net), annualTax: r.tax, detail: r.detail, withholdingPerPeriod: perPeriodTax };
  }

  /* =====================================================================
   * 3) VAT — ภ.พ.30 ระดับใบกำกับภาษี
   * ===================================================================== */
  function getVatRate(dateISO, cfg) {
    const v = pickVersion(cfg.vatVersions, dateISO);
    return v ? { ratePct: v.ratePct, note: v.note } : { ratePct: null, note: "ไม่พบอัตรา VAT สำหรับวันที่นี้" };
  }

  /* invoices: [{date, base, vat(optional — ถ้าไม่ใส่จะคำนวณจากอัตราตามวันที่), type:'sale'|'purchase',
   *            disallowed:boolean (ภาษีซื้อต้องห้าม)}] */
  function calcPP30(input, cfg) {
    let outputVat = 0, outputBase = 0, inputVat = 0, inputBase = 0, disallowedVat = 0;
    const warnings = [];
    for (const inv of (input.invoices || [])) {
      const base = Number(inv.base || 0);
      const rate = getVatRate(inv.date, cfg).ratePct;
      const vat = (inv.vat !== undefined && inv.vat !== null && inv.vat !== "")
        ? Number(inv.vat) : round2(base * rate / 100);
      const expect = round2(base * rate / 100);
      if (Math.abs(vat - expect) > 0.02) {
        warnings.push("ใบกำกับ " + (inv.no || inv.date) + ": VAT ที่กรอก (" + vat + ") ต่างจากอัตรา " + rate + "% (" + expect + ")");
      }
      if (inv.type === "sale") { outputBase += base; outputVat += vat; }
      else if (inv.disallowed) { disallowedVat += vat; }
      else { inputBase += base; inputVat += vat; }
    }
    const broughtForward = Number(input.broughtForwardCredit || 0);
    const diff = round2(outputVat - inputVat - broughtForward);
    return {
      outputBase: round2(outputBase), outputVat: round2(outputVat),
      inputBase: round2(inputBase), inputVat: round2(inputVat),
      disallowedInputVat: round2(disallowedVat),
      broughtForwardCredit: round2(broughtForward),
      taxPayable: diff > 0 ? diff : 0,
      excessCredit: diff < 0 ? round2(-diff) : 0,  // ยกไปเดือนถัดไปหรือขอคืน
      warnings
    };
  }

  /* =====================================================================
   * 4) เบี้ยปรับ / เงินเพิ่ม
   * ===================================================================== */
  function monthsLate(dueISO, payISO) {
    const due = parseDate(dueISO), pay = parseDate(payISO);
    if (pay <= due) return 0;
    let m = (pay.getFullYear() - due.getFullYear()) * 12 + (pay.getMonth() - due.getMonth());
    if (pay.getDate() > due.getDate()) m += 1;       // เศษของเดือนนับเป็น 1 เดือน
    return Math.max(m, 1);
  }

  /* เงินเพิ่ม 1.5%/เดือน เพดานเท่าจำนวนภาษี */
  function calcSurcharge(taxDue, dueISO, payISO, cfg) {
    const m = monthsLate(dueISO, payISO);
    const raw = Number(taxDue) * cfg.penalties.surchargeMonthlyPct / 100 * m;
    const cap = Number(taxDue) * cfg.penalties.surchargeCapPct / 100;
    return { monthsLate: m, surcharge: round2(Math.min(raw, cap)), capped: raw > cap };
  }

  /* เบี้ยปรับ+เงินเพิ่ม+ค่าปรับอาญา กรณียื่น ภ.พ.30 ล่าช้า (ยื่นเองก่อนถูกตรวจพบ) */
  function calcVatLatePenalty(taxDue, dueISO, payISO, cfg) {
    const due = parseDate(dueISO), pay = parseDate(payISO);
    const daysLate = Math.max(Math.ceil((pay - due) / 86400000), 0);
    const sur = calcSurcharge(taxDue, dueISO, payISO, cfg);
    let penalty = 0, penaltyNote = "";
    if (daysLate > 0 && Number(taxDue) > 0) {
      const full = Number(taxDue) * cfg.penalties.vat.civilPenaltyMultiplier;
      const sched = cfg.penalties.vat.reductionSchedule.find(
        (s) => s.daysMax === null || daysLate <= s.daysMax);
      penalty = round2(full * sched.payPctOfPenalty / 100);
      penaltyNote = "เบี้ยปรับ " + cfg.penalties.vat.civilPenaltyMultiplier + " เท่า ลดเหลือ " + sched.payPctOfPenalty + "% (ล่าช้า " + daysLate + " วัน, ท.ป.81/2542)";
    }
    const fine = daysLate === 0 ? 0 :
      (daysLate <= 7 ? cfg.penalties.vat.criminalFine.within7Days : cfg.penalties.vat.criminalFine.after7Days);
    return { daysLate, surcharge: sur.surcharge, monthsLate: sur.monthsLate,
             civilPenalty: penalty, penaltyNote, criminalFine: fine,
             total: round2(sur.surcharge + penalty + fine + Number(taxDue)) };
  }

  /* ภ.ง.ด. (CIT/WHT) ยื่นล่าช้า: เงินเพิ่ม 1.5%/เดือน + ค่าปรับอาญา */
  function calcIncomeTaxLatePenalty(taxDue, dueISO, payISO, cfg) {
    const due = parseDate(dueISO), pay = parseDate(payISO);
    const daysLate = Math.max(Math.ceil((pay - due) / 86400000), 0);
    const sur = calcSurcharge(taxDue, dueISO, payISO, cfg);
    const fine = daysLate === 0 ? 0 :
      (daysLate <= 7 ? cfg.penalties.incomeTax.criminalFine.within7Days : cfg.penalties.incomeTax.criminalFine.after7Days);
    return { daysLate, monthsLate: sur.monthsLate, surcharge: sur.surcharge, criminalFine: fine,
             total: round2(sur.surcharge + fine + Number(taxDue)) };
  }

  /* =====================================================================
   * 5) ปฏิทินกำหนดเวลา — คำนวณจากรอบบัญชีของบริษัท
   * ===================================================================== */
  function efilingApplies(dateISO, cfg) {
    const e = cfg.deadlines.efiling;
    const d = parseDate(dateISO);
    return d >= parseDate(e.validFrom) && d <= parseDate(e.validTo);
  }

  /* สร้าง deadline รายเดือน + รายปี สำหรับช่วง fromISO..toISO */
  function buildDeadlines(profile, fromISO, toISO, cfg) {
    const out = [];
    const from = parseDate(fromISO), to = parseDate(toISO);
    // รายเดือน: WHT + VAT ของ "เดือนภาษี" ก่อนหน้า
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur <= to) {
      const taxMonth = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
      const label = taxMonth.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
      const whtDue = new Date(cur.getFullYear(), cur.getMonth(), cfg.deadlines.whtDayOfNextMonth);
      out.push({ kind: "WHT", form: "ภ.ง.ด.1/3/53", period: label, due: fmtISO(whtDue),
                 dueEfiling: fmtISO(addDays(whtDue, efilingApplies(fmtISO(whtDue), cfg) ? cfg.deadlines.efiling.extensionDays : 0)) });
      if (profile.vatRegistered) {
        const vatDue = new Date(cur.getFullYear(), cur.getMonth(), cfg.deadlines.vatDayOfNextMonth);
        out.push({ kind: "VAT", form: "ภ.พ.30", period: label, due: fmtISO(vatDue),
                   dueEfiling: fmtISO(addDays(vatDue, efilingApplies(fmtISO(vatDue), cfg) ? cfg.deadlines.efiling.extensionDays : 0)) });
      }
      cur = addMonths(cur, 1);
    }
    // รายปี: หา fiscal year ที่คาบเกี่ยวช่วงที่ขอ
    const fyEndMonth = Number(profile.fiscalYearEndMonth || 12); // เดือนสิ้นรอบ (1-12)
    const fyEndDay = Number(profile.fiscalYearEndDay || 31);
    for (let y = from.getFullYear() - 1; y <= to.getFullYear(); y++) {
      const fyEnd = new Date(y, fyEndMonth - 1, fyEndDay);
      const fyStart = addDays(addMonths(fyEnd, -12), 1);
      const halfEnd = addDays(addMonths(fyStart, 6), -1);
      // นับแบบกฎหมาย: เริ่มนับวันถัดจากวันสิ้นงวด ครบ 2 เดือน (30 มิ.ย. → 31 ส.ค.)
      const pnd51Due = addDays(addMonths(addDays(halfEnd, 1), cfg.deadlines.pnd51MonthsAfterHalfYear), -1);
      const pnd50Due = addDays(fyEnd, cfg.deadlines.pnd50DaysAfterYearEnd);
      for (const [form, dRaw, period] of [
        ["ภ.ง.ด.51", pnd51Due, "ครึ่งรอบบัญชีสิ้นสุด " + fmtISO(halfEnd)],
        ["ภ.ง.ด.50", pnd50Due, "รอบบัญชีสิ้นสุด " + fmtISO(fyEnd)]
      ]) {
        if (dRaw >= from && dRaw <= to) {
          out.push({ kind: "CIT", form, period, due: fmtISO(dRaw),
                     dueEfiling: fmtISO(addDays(dRaw, efilingApplies(fmtISO(dRaw), cfg) ? cfg.deadlines.efiling.extensionDays : 0)) });
        }
      }
    }
    out.sort((a, b) => a.due.localeCompare(b.due));
    return out;
  }

  const api = {
    round2, pickVersion, progressiveTax, isSME, adjustProfit, calcCIT,
    calcPND51, calcPND51Surcharge, calcPND50, calcWHT, calcPND1Withholding,
    getVatRate, calcPP30, monthsLate, calcSurcharge, calcVatLatePenalty,
    calcIncomeTaxLatePenalty, buildDeadlines, efilingApplies, fmtISO
  };
  if (typeof module !== "undefined") module.exports = api;
  global.TaxEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
