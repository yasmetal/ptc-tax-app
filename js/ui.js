/* ui.js — เชื่อม DOM กับ TaxEngine/TaxStore */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const E = window.TaxEngine, S = window.TaxStore;
  let DATA = S.load();
  const cfg = () => S.activeConfig(DATA);
  const thb = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const todayISO = () => E.fmtISO(new Date());

  /* ---------- tabs ---------- */
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("nav.tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab-page").forEach((p) => p.classList.toggle("active", p.id === "page-" + b.dataset.tab));
    if (b.dataset.tab === "dash") renderDashboard();
  });

  /* ---------- โปรไฟล์ ---------- */
  function initProfile() {
    const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
    $("pf-fyem").innerHTML = months.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
    const p = DATA.profile;
    $("pf-name").value = p.companyName; $("pf-taxid").value = p.taxId;
    $("pf-branch").value = p.branch; $("pf-address").value = p.address;
    $("pf-capital").value = p.paidUpCapital || ""; $("pf-revenue").value = p.annualRevenue || "";
    $("pf-fyem").value = p.fiscalYearEndMonth; $("pf-fyed").value = p.fiscalYearEndDay;
    $("pf-vat").value = p.vatRegistered ? "1" : "0";
    showSmeStatus();
  }
  function showSmeStatus() {
    const c = cfg(); if (!c) return;
    const citCfg = E.pickVersion(c.citVersions, todayISO());
    const p = DATA.profile;
    if (!p.paidUpCapital && !p.annualRevenue) { $("smeStatus").style.display = "none"; return; }
    const sme = E.isSME(p, citCfg);
    const el = $("smeStatus");
    el.style.display = "block";
    el.className = "alert " + (sme ? "ok" : "warn");
    el.innerHTML = sme
      ? `✅ เข้าเงื่อนไข <b>SME</b> (ทุนชำระแล้ว ≤ ${thb(citCfg.sme.paidUpCapitalMax)} และรายได้ ≤ ${thb(citCfg.sme.revenueMax)}) — ใช้อัตราขั้นบันได: ยกเว้น 300,000 แรก / 15% / 20%`
      : `ℹ️ ไม่เข้าเงื่อนไข SME — ใช้อัตราปกติ ${citCfg.standardRatePct}% ของกำไรสุทธิ (ต้องเข้าเงื่อนไขทั้งทุน ≤ 5 ล้าน และรายได้ ≤ 30 ล้าน)`;
  }
  $("pf-save").onclick = () => {
    DATA.profile = {
      companyName: $("pf-name").value, taxId: $("pf-taxid").value,
      branch: $("pf-branch").value, address: $("pf-address").value,
      paidUpCapital: Number($("pf-capital").value || 0),
      annualRevenue: Number($("pf-revenue").value || 0),
      fiscalYearEndMonth: Number($("pf-fyem").value),
      fiscalYearEndDay: Number($("pf-fyed").value),
      vatRegistered: $("pf-vat").value === "1"
    };
    S.save(DATA, "แก้ไขโปรไฟล์บริษัท");
    showSmeStatus(); renderDashboard();
    alert("บันทึกแล้ว");
  };

  /* ---------- แดชบอร์ด ---------- */
  function renderDashboard() {
    const c = cfg();
    const list = E.buildDeadlines(DATA.profile, todayISO(), E.fmtISO(new Date(Date.now() + 365 * 86400000)), c);
    const tb = $("deadlineTable").querySelector("tbody");
    const now = new Date();
    tb.innerHTML = list.map((d) => {
      const dueE = new Date(d.dueEfiling + "T23:59:59");
      const days = Math.ceil((dueE - now) / 86400000);
      const badge = days < 0 ? '<span class="badge late">เลยกำหนด</span>'
        : days <= 7 ? `<span class="badge soon">อีก ${days} วัน</span>`
        : `<span class="badge">อีก ${days} วัน</span>`;
      return `<tr><td>${badge}</td><td><b>${d.form}</b></td><td>${d.period}</td><td>${d.due}</td><td>${d.dueEfiling}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="muted">—</td></tr>';

    const citCfg = E.pickVersion(c.citVersions, todayISO());
    const p = DATA.profile;
    if (p.companyName || p.paidUpCapital) {
      const sme = E.isSME(p, citCfg);
      const vr = E.getVatRate(todayISO(), c);
      $("dashSummary").innerHTML =
        `<b>${p.companyName || "(ยังไม่ระบุชื่อ)"}</b> · เลขผู้เสียภาษี ${p.taxId || "—"}<br>
         สถานะ CIT: ${sme ? "SME (อัตราขั้นบันได)" : "อัตราปกติ " + citCfg.standardRatePct + "%"} ·
         VAT ปัจจุบัน: ${vr.ratePct}% <span class="muted">(${vr.note})</span> ·
         จด VAT: ${p.vatRegistered ? "ใช่" : "ไม่"}<br>
         <span class="muted">config เวอร์ชัน ${c.meta.configVersion} ตรวจสอบล่าสุด ${c.meta.lastVerified}</span>`;
    }
  }

  /* ---------- CIT: ภ.ง.ด.51 ---------- */
  $("p51-calc").onclick = () => {
    const c = cfg(); const citCfg = E.pickVersion(c.citVersions, todayISO());
    const sme = E.isSME(DATA.profile, citCfg);
    const r = E.calcPND51({
      estimatedAnnualTaxProfit: $("p51-est").value,
      referenceActualProfit: $("p51-ref").value,
      whtCreditHalfYear: $("p51-wht").value, sme
    }, citCfg);
    let html = `<div class="result">
      กึ่งหนึ่งของประมาณการกำไร: <b>${thb(r.halfProfit)}</b> บาท (${sme ? "อัตรา SME" : "อัตราปกติ"})<br>
      ${r.detail.map((d) => `ช่วง ${thb(d.from)}–${thb(d.to)} @${d.ratePct}% = ${thb(d.tax)}`).join("<br>")}<br>
      ภาษีคำนวณได้ ${thb(r.tax)} − เครดิต WHT ${thb(r.whtCredit)}<br>
      <span class="big">ต้องชำระตาม ภ.ง.ด.51: ${thb(r.payable)} บาท</span></div>`;
    if (r.risk) {
      html += `<div class="alert ${r.risk.exceeds25 ? "danger" : "ok"}">${r.risk.note}<br>
        ประมาณการขั้นต่ำที่ปลอดภัย (75% ของกำไรอ้างอิง): <b>${thb(r.risk.safeMinimumEstimate)}</b> บาท
        (ตอนนี้ต่ำกว่าอ้างอิง ${thb(r.risk.shortfallPct)}%)</div>`;
    }
    $("p51-result").innerHTML = html;
    DATA.citWorkings.lastPnd51 = { date: todayISO(), input: { est: $("p51-est").value }, result: r };
    S.save(DATA, "คำนวณ ภ.ง.ด.51");
  };

  /* ---------- CIT: dynamic rows ---------- */
  function rowTemplate(kind) {
    const c = cfg();
    if (kind === "loss") {
      return `<div class="grid g3 loss-row" style="margin-bottom:6px">
        <div><label>วันสิ้นรอบบัญชีปีที่ขาดทุน</label><input type="date" class="l-end"></div>
        <div><label>ขาดทุนคงเหลือ (บาท)</label><input type="number" class="l-amt"></div>
        <div><button class="btn small danger rm" style="margin-top:24px">ลบ</button></div></div>`;
    }
    const opts = kind === "addback"
      ? c.disallowedExpenseTypes.map((t) => `<option>${t.label}</option>`).join("")
      : `<option>รายได้ยกเว้น/เงินปันผลที่ได้รับยกเว้น</option>
         <option>หักรายจ่ายเพิ่ม (มาตรการ SME เช่น หัก 2 เท่า — กรอกเฉพาะส่วนเพิ่ม)</option>
         <option>ค่าเสื่อมเริ่มแรก SME (คอมพิวเตอร์ 40% / โรงงาน 25% / เครื่องจักร 40%)</option>
         <option>อื่นๆ</option>`;
    return `<div class="grid g3 ${kind}-row" style="margin-bottom:6px">
      <div><label>รายการ</label><select class="r-label">${opts}</select></div>
      <div><label>จำนวนเงิน (บาท)</label><input type="number" class="r-amt"></div>
      <div><button class="btn small danger rm" style="margin-top:24px">ลบ</button></div></div>`;
  }
  function addRow(containerId, kind) {
    const div = document.createElement("div");
    div.innerHTML = rowTemplate(kind);
    const el = div.firstElementChild;
    el.querySelector(".rm").onclick = () => el.remove();
    $(containerId).appendChild(el);
  }
  $("p50-add-addback").onclick = () => addRow("addbackRows", "addback");
  $("p50-add-deduct").onclick = () => addRow("deductRows", "deduct");
  $("p50-add-loss").onclick = () => addRow("lossRows", "loss");

  /* ---------- CIT: ภ.ง.ด.50 ---------- */
  $("p50-calc").onclick = () => {
    const c = cfg(); const citCfg = E.pickVersion(c.citVersions, $("p50-end").value || todayISO());
    const sme = E.isSME(DATA.profile, citCfg);
    const collect = (sel, isLoss) => [...document.querySelectorAll(sel)].map((row) => isLoss
      ? { periodEndDate: row.querySelector(".l-end").value, remaining: Number(row.querySelector(".l-amt").value || 0) }
      : { label: row.querySelector(".r-label").value, amount: Number(row.querySelector(".r-amt").value || 0) });
    const r = E.calcPND50({
      accountingProfit: $("p50-acc").value,
      currentPeriodEnd: $("p50-end").value || todayISO(),
      addbacks: collect(".addback-row"), deductions: collect(".deduct-row"),
      lossCarryItems: collect(".loss-row", true),
      pnd51Paid: $("p50-paid51").value, whtCredit: $("p50-whtc").value, sme
    }, citCfg);
    const a = r.adjustment;
    let html = `<div class="result">
      กำไรทางบัญชี ${thb(a.accountingProfit)} + บวกกลับ ${thb(a.totalAddback)} − หักเพิ่ม ${thb(a.totalDeduction)}
      = กำไรก่อนหักขาดทุน ${thb(a.profitBeforeLoss)}<br>
      หักขาดทุนยกมา (≤${citCfg.lossCarryForwardPeriods} รอบบัญชี): ${thb(a.lossUsed)}
      → <b>กำไรสุทธิทางภาษี ${thb(a.taxProfit)}</b><br>
      ${r.detail.map((d) => `ช่วง ${thb(d.from)}–${thb(d.to)} @${d.ratePct}% = ${thb(d.tax)}`).join("<br>")}<br>
      ภาษีทั้งปี ${thb(r.tax)} − ภ.ง.ด.51 ${thb(r.pnd51Paid)} − WHT ${thb(r.whtCredit)}<br>
      <span class="big">${r.payable > 0 ? "ต้องชำระเพิ่ม " + thb(r.payable) + " บาท" : "ชำระไว้เกิน ขอคืนได้ " + thb(r.refundable) + " บาท"}</span></div>`;
    if (a.lossExpired.length) {
      html += `<div class="alert warn">ขาดทุนหมดอายุ (เกิน ${citCfg.lossCarryForwardPeriods} รอบบัญชี ใช้ไม่ได้): ${a.lossExpired.map((l) => l.periodEndDate + " จำนวน " + thb(l.remaining)).join(", ")}</div>`;
    }
    $("p50-result").innerHTML = html;

    // เช็คย้อนหลัง ม.67 ตรี ถ้าเคยกรอกประมาณการไว้
    const est = Number((DATA.citWorkings.lastPnd51 || {}).input?.est || 0);
    if (est > 0 && a.taxProfit > 0) {
      const sc = E.calcPND51Surcharge({ actualAnnualTaxProfit: a.taxProfit, estimatedAnnualTaxProfit: est, sme }, citCfg);
      $("p51-check-result").innerHTML = sc.applies
        ? `<div class="alert danger">⚠️ ประมาณการ ภ.ง.ด.51 (${thb(est)}) ต่ำกว่ากำไรจริง ${thb(sc.shortfallPct)}% (เกิน ${citCfg.halfYear.underestimateThresholdPct}%)
           — หากไม่มีเหตุอันสมควร เงินเพิ่ม ม.67 ตรี ≈ <b>${thb(sc.surcharge)}</b> บาท (20% ของภาษีครึ่งปีที่ขาด ${thb(sc.shortTax)})</div>`
        : `<div class="alert ok">✓ ประมาณการ ภ.ง.ด.51 ขาดไป ${thb(sc.shortfallPct)}% ไม่เกินเกณฑ์ 25% — ไม่มีเงินเพิ่ม ม.67 ตรี</div>`;
    }
    S.save(DATA, "คำนวณ ภ.ง.ด.50");
  };

  /* ---------- ค่าเสื่อม ---------- */
  function initDep() {
    $("dep-type").innerHTML = cfg().depreciationRates
      .map((d) => `<option value="${d.key}">${d.label} (สูงสุด ${d.maxRatePct}%)</option>`).join("");
  }
  $("dep-calc").onclick = () => {
    const c = cfg();
    const d = c.depreciationRates.find((x) => x.key === $("dep-type").value);
    let cost = Number($("dep-cost").value || 0);
    let capNote = "";
    if (d.costCap && cost > d.costCap) { capNote = ` (จำกัดฐาน ${thb(d.costCap)} จากราคาจริง ${thb(cost)})`; cost = d.costCap; }
    const days = Number($("dep-days").value || 365);
    const dep = E.round2(cost * d.maxRatePct / 100 * days / 365);
    $("dep-result").innerHTML = `<div class="result">ค่าเสื่อมทางภาษีปีนี้ (สูงสุด): <span class="big">${thb(dep)}</span> บาท${capNote}<br>
      <span class="muted">= ${thb(cost)} × ${d.maxRatePct}% × ${days}/365 — หากค่าเสื่อมทางบัญชีสูงกว่านี้ ส่วนต่างต้อง "บวกกลับ" ใน ภ.ง.ด.50</span></div>`;
  };

  /* ---------- WHT ---------- */
  function initWht() {
    $("w-type").innerHTML = cfg().whtTypes
      .map((t) => `<option value="${t.key}">${t.label}${t.ratePct !== null ? " — " + t.ratePct + "%" : ""}</option>`).join("");
    $("w-date").value = todayISO();
    $("w-month").value = todayISO().slice(0, 7);
    $("w-type").onchange = $("w-payee-kind").onchange = () => {
      const salary = $("w-type").value === "salary" || $("w-payee-kind").value === "employee";
      $("w-salary-extra").style.display = salary ? "block" : "none";
      if ($("w-type").value === "salary") $("w-payee-kind").value = "employee";
    };
  }
  function whtForm(kind) { return kind === "employee" ? "ภ.ง.ด.1" : kind === "company" ? "ภ.ง.ด.53" : "ภ.ง.ด.3"; }

  $("w-add").onclick = () => {
    const c = cfg();
    const kind = $("w-payee-kind").value;
    const amount = Number($("w-amount").value || 0);
    let tax, ratePct, typeLabel;
    if ($("w-type").value === "salary" || kind === "employee") {
      const r = E.calcPND1Withholding({
        monthlySalary: amount, periodsPerYear: $("w-periods").value,
        annualBonus: $("w-bonus").value, otherAllowances: $("w-allow").value, date: $("w-date").value
      }, c);
      tax = r.withholdingPerPeriod; ratePct = null; typeLabel = "เงินเดือน (อัตราก้าวหน้า)";
      $("w-preview").innerHTML = `<div class="result">เงินได้ทั้งปี ${thb(r.annualIncome)} − ค่าใช้จ่าย ${thb(r.expense)} − ลดหย่อน ${thb(r.allowances)} = เงินได้สุทธิ ${thb(r.netIncome)}<br>
        ภาษีทั้งปี ${thb(r.annualTax)} ÷ งวด → <span class="big">หักงวดละ ${thb(tax)} บาท</span></div>`;
    } else {
      const r = E.calcWHT($("w-type").value, amount, c);
      tax = r.tax; ratePct = r.ratePct; typeLabel = r.type.label;
      $("w-preview").innerHTML = `<div class="result">${typeLabel} อัตรา ${ratePct}%
        ${r.belowMinimum ? "— <b>ต่ำกว่า " + thb(c.whtMinAmount) + " ไม่ต้องหัก</b>" : ""}<br>
        ภาษีหัก <span class="big">${thb(tax)}</span> บาท · จ่ายสุทธิ ${thb(r.netPay)} บาท</div>`;
    }
    DATA.whtRecords.push({
      id: Date.now(), date: $("w-date").value, month: $("w-date").value.slice(0, 7),
      payee: $("w-payee").value, payeeTin: $("w-payee-tin").value, payeeAddr: $("w-payee-addr").value,
      payeeKind: kind, typeKey: $("w-type").value, typeLabel, amount, ratePct, tax
    });
    S.save(DATA, "บันทึก WHT: " + $("w-payee").value);
    renderWhtTable();
  };

  function renderWhtTable() {
    const m = $("w-month").value;
    const rows = DATA.whtRecords.filter((r) => r.month === m);
    const tb = $("whtTable").querySelector("tbody");
    tb.innerHTML = rows.map((r) => `<tr>
      <td>${r.date}</td><td>${r.payee}<br><span class="muted">${r.payeeTin || ""}</span></td>
      <td>${r.typeLabel}</td><td>${whtForm(r.payeeKind)}</td>
      <td class="num">${thb(r.amount)}</td><td class="num">${r.ratePct === null ? "ก้าวหน้า" : r.ratePct + "%"}</td>
      <td class="num">${thb(r.tax)}</td>
      <td class="row-actions"><button class="btn small secondary" data-cert="${r.id}">🖨 หนังสือรับรอง</button>
      <button class="btn small danger" data-del="${r.id}">ลบ</button></td></tr>`).join("")
      || '<tr><td colspan="8" class="muted">ไม่มีรายการในเดือนนี้</td></tr>';
    $("w-sum-amt").textContent = thb(rows.reduce((s, r) => s + r.amount, 0));
    $("w-sum-tax").textContent = thb(rows.reduce((s, r) => s + r.tax, 0));
  }
  $("w-month").onchange = renderWhtTable;
  $("whtTable").addEventListener("click", (e) => {
    const del = e.target.dataset.del, cert = e.target.dataset.cert;
    if (del) {
      DATA.whtRecords = DATA.whtRecords.filter((r) => r.id != del);
      S.save(DATA, "ลบรายการ WHT"); renderWhtTable();
    }
    if (cert) printCertificate(DATA.whtRecords.find((r) => r.id == cert));
  });

  /* หนังสือรับรองการหักภาษี ณ ที่จ่าย (ม.50 ทวิ) — พิมพ์/บันทึกเป็น PDF ผ่าน dialog เบราว์เซอร์ */
  function printCertificate(r) {
    if (!r) return;
    const p = DATA.profile;
    $("printArea").innerHTML = `<div class="cert">
      <h2>หนังสือรับรองการหักภาษี ณ ที่จ่าย<br>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</h2>
      <p><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย:</b> ${p.companyName || "-"}<br>
      เลขประจำตัวผู้เสียภาษี: ${p.taxId || "-"} สาขา: ${p.branch || "-"}<br>ที่อยู่: ${p.address || "-"}</p>
      <p><b>ผู้ถูกหักภาษี ณ ที่จ่าย:</b> ${r.payee}<br>
      เลขประจำตัวผู้เสียภาษี: ${r.payeeTin || "-"}<br>ที่อยู่: ${r.payeeAddr || "-"}</p>
      <p><b>แบบยื่น:</b> ${whtForm(r.payeeKind)}</p>
      <table><thead><tr><th>ประเภทเงินได้</th><th>วันที่จ่าย</th>
        <th class="num">จำนวนเงินที่จ่าย</th><th class="num">ภาษีที่หักและนำส่ง</th></tr></thead>
      <tbody><tr><td>${r.typeLabel}</td><td>${r.date}</td>
        <td class="num">${thb(r.amount)}</td><td class="num">${thb(r.tax)}</td></tr>
      <tr><th colspan="2">รวม</th><th class="num">${thb(r.amount)}</th><th class="num">${thb(r.tax)}</th></tr></tbody></table>
      <p>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
      <div class="sign"><div>ลงชื่อ .................................. ผู้จ่ายเงิน<br>( .................................. )<br>วันที่ ${r.date}</div></div>
    </div>`;
    window.print();
  }

  /* CSV ใบแนบ ภ.ง.ด.3/53 (โครงตาม RD Prep — ตรวจ spec ล่าสุดก่อนใช้จริง) */
  $("w-export").onclick = () => {
    const m = $("w-month").value;
    const rows = DATA.whtRecords.filter((r) => r.month === m && r.payeeKind !== "employee");
    if (!rows.length) return alert("ไม่มีรายการ ภ.ง.ด.3/53 ในเดือนนี้");
    const head = "ลำดับ,เลขประจำตัวผู้เสียภาษี,ชื่อผู้รับเงิน,ที่อยู่,วันที่จ่าย,ประเภทเงินได้,อัตราภาษี(%),จำนวนเงินที่จ่าย,ภาษีที่หัก,แบบ";
    const body = rows.map((r, i) =>
      [i + 1, r.payeeTin, '"' + r.payee + '"', '"' + (r.payeeAddr || "") + '"', r.date,
       '"' + r.typeLabel + '"', r.ratePct, r.amount.toFixed(2), r.tax.toFixed(2), whtForm(r.payeeKind)].join(","));
    downloadText("wht-attach-" + m + ".csv", "﻿" + head + "\n" + body.join("\n"));
  };

  /* ---------- VAT ---------- */
  function initVat() {
    $("v-date").value = todayISO(); $("v-month").value = todayISO().slice(0, 7);
    $("v-type").onchange = () => {
      $("v-disallowed-wrap").style.display = $("v-type").value === "purchase" ? "block" : "none";
    };
  }
  $("v-add").onclick = () => {
    const inv = {
      id: Date.now(), type: $("v-type").value, date: $("v-date").value,
      month: $("v-date").value.slice(0, 7), no: $("v-no").value,
      party: $("v-party").value, partyTin: $("v-party-tin").value,
      base: Number($("v-base").value || 0),
      vat: $("v-vat").value === "" ? null : Number($("v-vat").value),
      disallowed: $("v-disallowed").value === "1" && $("v-type").value === "purchase"
    };
    if (inv.vat === null) inv.vat = E.round2(inv.base * E.getVatRate(inv.date, cfg()).ratePct / 100);
    DATA.vatInvoices.push(inv);
    S.save(DATA, "บันทึกใบกำกับ " + inv.no);
    $("v-no").value = ""; $("v-base").value = ""; $("v-vat").value = "";
    renderVatTable();
  };
  function renderVatTable() {
    const m = $("v-month").value;
    const rows = DATA.vatInvoices.filter((r) => r.month === m);
    $("vatTable").querySelector("tbody").innerHTML = rows.map((r) => `<tr>
      <td>${r.date}</td><td>${r.no}</td><td>${r.party}</td>
      <td>${r.type === "sale" ? "ขาย" : "ซื้อ" + (r.disallowed ? " (ต้องห้าม)" : "")}</td>
      <td class="num">${thb(r.base)}</td><td class="num">${thb(r.vat)}</td>
      <td><button class="btn small danger" data-vdel="${r.id}">ลบ</button></td></tr>`).join("")
      || '<tr><td colspan="7" class="muted">ไม่มีใบกำกับในเดือนนี้</td></tr>';
    $("v-bf").value = DATA.vatBroughtForward[m] || 0;
  }
  $("v-month").onchange = renderVatTable;
  $("vatTable").addEventListener("click", (e) => {
    if (e.target.dataset.vdel) {
      DATA.vatInvoices = DATA.vatInvoices.filter((r) => r.id != e.target.dataset.vdel);
      S.save(DATA, "ลบใบกำกับ"); renderVatTable();
    }
  });
  $("v-calc").onclick = () => {
    const m = $("v-month").value;
    DATA.vatBroughtForward[m] = Number($("v-bf").value || 0);
    const r = E.calcPP30({
      invoices: DATA.vatInvoices.filter((x) => x.month === m),
      broughtForwardCredit: DATA.vatBroughtForward[m]
    }, cfg());
    let html = `<div class="result">
      ภาษีขาย: ฐาน ${thb(r.outputBase)} → VAT <b>${thb(r.outputVat)}</b><br>
      ภาษีซื้อ (เครดิตได้): ฐาน ${thb(r.inputBase)} → VAT <b>${thb(r.inputVat)}</b>
      ${r.disallowedInputVat ? "<br>ภาษีซื้อต้องห้าม (ไม่นำมาเครดิต): " + thb(r.disallowedInputVat) : ""}<br>
      เครดิตยกมา: ${thb(r.broughtForwardCredit)}<br>
      <span class="big">${r.taxPayable > 0 ? "ต้องชำระ " + thb(r.taxPayable) + " บาท" : "เครดิตเหลือยกไปเดือนถัดไป/ขอคืน " + thb(r.excessCredit) + " บาท"}</span></div>`;
    if (r.warnings.length) html += `<div class="alert warn">${r.warnings.join("<br>")}</div>`;
    if (r.excessCredit > 0) {
      const next = new Date(m + "-01"); next.setMonth(next.getMonth() + 1);
      const nm = next.toISOString().slice(0, 7);
      DATA.vatBroughtForward[nm] = r.excessCredit;
      html += `<div class="alert ok">บันทึกเครดิต ${thb(r.excessCredit)} ยกไปเดือน ${nm} ให้แล้ว</div>`;
    }
    $("v-result").innerHTML = html;
    S.save(DATA, "กระทบยอด ภ.พ.30 เดือน " + m);
  };
  $("v-export").onclick = () => {
    const m = $("v-month").value;
    const rows = DATA.vatInvoices.filter((r) => r.month === m);
    if (!rows.length) return alert("ไม่มีใบกำกับ");
    const head = "วันที่,เลขที่ใบกำกับ,ชื่อคู่ค้า,เลขผู้เสียภาษีคู่ค้า,ประเภท,ฐานภาษี,VAT,ภาษีซื้อต้องห้าม";
    const body = rows.map((r) => [r.date, r.no, '"' + r.party + '"', r.partyTin,
      r.type === "sale" ? "ขาย" : "ซื้อ", r.base.toFixed(2), r.vat.toFixed(2), r.disallowed ? "ใช่" : ""].join(","));
    downloadText("vat-report-" + m + ".csv", "﻿" + head + "\n" + body.join("\n"));
  };

  /* ---------- Penalty ---------- */
  $("pn-calc").onclick = () => {
    const c = cfg();
    const tax = Number($("pn-tax").value || 0);
    const due = $("pn-due").value, pay = $("pn-pay").value;
    if (!due || !pay) return alert("กรอกวันครบกำหนดและวันชำระ");
    let r, html;
    if ($("pn-form").value === "vat") {
      r = E.calcVatLatePenalty(tax, due, pay, c);
      html = `<div class="result">ล่าช้า ${r.daysLate} วัน (นับเป็น ${r.monthsLate} เดือน)<br>
        เงินเพิ่ม 1.5%/เดือน: ${thb(r.surcharge)}<br>
        เบี้ยปรับ: ${thb(r.civilPenalty)} <span class="muted">${r.penaltyNote}</span><br>
        ค่าปรับอาญา: ${thb(r.criminalFine)}<br>
        <span class="big">รวมต้องชำระ (รวมภาษี): ${thb(r.total)} บาท</span></div>`;
    } else {
      r = E.calcIncomeTaxLatePenalty(tax, due, pay, c);
      html = `<div class="result">ล่าช้า ${r.daysLate} วัน (นับเป็น ${r.monthsLate} เดือน)<br>
        เงินเพิ่ม 1.5%/เดือน (เพดานเท่าจำนวนภาษี): ${thb(r.surcharge)}<br>
        ค่าปรับอาญา (เปรียบเทียบปรับ): ${thb(r.criminalFine)}<br>
        <span class="big">รวมต้องชำระ (รวมภาษี): ${thb(r.total)} บาท</span></div>`;
    }
    $("pn-result").innerHTML = html;
  };

  /* ---------- Settings ---------- */
  function initSettings() {
    $("cfg-json").value = JSON.stringify(cfg(), null, 2);
    $("gd-clientid").value = S.DRIVE.getClientId();
    renderAudit();
  }
  $("cfg-save").onclick = () => {
    try {
      DATA.configOverride = JSON.parse($("cfg-json").value);
      S.save(DATA, "แก้ไขตารางอัตราภาษี");
      $("cfg-msg").innerHTML = '<div class="alert ok">บันทึกแล้ว — ระบบใช้ config นี้แทนค่าเริ่มต้น</div>';
      initDep(); initWht(); renderDashboard();
    } catch (e) { $("cfg-msg").innerHTML = '<div class="alert danger">JSON ไม่ถูกต้อง: ' + e.message + "</div>"; }
  };
  $("cfg-reset").onclick = () => {
    DATA.configOverride = null; S.save(DATA, "คืนค่า config เริ่มต้น");
    initSettings(); initDep(); initWht();
  };
  $("gd-save-id").onclick = () => { S.DRIVE.setClientId($("gd-clientid").value); alert("บันทึก Client ID แล้ว"); };
  $("gd-upload").onclick = () => S.DRIVE.upload(DATA, (e) =>
    $("gd-msg").innerHTML = e ? '<div class="alert danger">' + e.message + "</div>"
      : '<div class="alert ok">✓ Backup ขึ้น Google Drive แล้ว (' + new Date().toLocaleString("th-TH") + ")</div>");
  $("gd-download").onclick = () => S.DRIVE.download((e, d) => {
    if (e) return $("gd-msg").innerHTML = '<div class="alert danger">' + e.message + "</div>";
    if (!confirm("แทนที่ข้อมูลในเครื่องด้วยข้อมูลจาก Drive?")) return;
    DATA = Object.assign(structuredClone(S.DEFAULT_DATA), d);
    S.save(DATA, "Restore จาก Google Drive");
    location.reload();
  });
  $("ex-json").onclick = () => S.exportJSON(DATA);
  $("im-json").onchange = (e) => {
    if (!e.target.files[0]) return;
    S.importJSON(e.target.files[0], (err, d) => {
      if (err) return alert("ไฟล์ไม่ถูกต้อง: " + err.message);
      DATA = d; S.save(DATA, "Import จากไฟล์ JSON"); location.reload();
    });
  };
  $("wipe").onclick = () => {
    if (confirm("ลบข้อมูลทั้งหมด?") && confirm("ยืนยันอีกครั้ง — กู้คืนไม่ได้ถ้าไม่มี backup")) {
      localStorage.removeItem("ptc-tax-app-v1"); location.reload();
    }
  };
  function renderAudit() {
    $("auditTable").querySelector("tbody").innerHTML =
      DATA.auditLog.slice(-30).reverse().map((a) =>
        `<tr><td>${new Date(a.ts).toLocaleString("th-TH")}</td><td>${a.action}</td></tr>`).join("")
      || '<tr><td colspan="2" class="muted">—</td></tr>';
  }

  function downloadText(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }

  /* ---------- boot ---------- */
  initProfile(); initDep(); initWht(); initVat(); initSettings();
  renderWhtTable(); renderVatTable(); renderDashboard();
  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.addEventListener("click", () => { if (b.dataset.tab === "settings") renderAudit(); });
  });
})();
