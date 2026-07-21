/* =====================================================================
 * storage.js — localStorage + Export/Import + Google Drive sync (OAuth)
 * ข้อมูลทั้งหมดอยู่ในเครื่องผู้ใช้ ไม่ส่งขึ้น server ใดๆ นอกจาก Google Drive
 * ของผู้ใช้เอง (ต้องกรอก OAuth Client ID ในหน้าตั้งค่า)
 * ===================================================================== */
(function (global) {
  "use strict";
  const KEY = "ptc-tax-app-v1";

  const DEFAULT_DATA = {
    profile: {
      companyName: "", taxId: "", branch: "00000", address: "",
      paidUpCapital: 0, annualRevenue: 0,
      fiscalYearEndMonth: 12, fiscalYearEndDay: 31,
      vatRegistered: true
    },
    configOverride: null,     // ถ้าผู้ใช้แก้อัตราภาษี จะเก็บทั้งก้อนที่นี่
    whtRecords: [],           // ธุรกรรมหัก ณ ที่จ่าย รายรายการ
    vatInvoices: [],          // ใบกำกับภาษีรายใบ {month:'YYYY-MM', ...}
    vatBroughtForward: {},    // เครดิตยกมา per เดือน
    citWorkings: {},          // ข้อมูล ภ.ง.ด.50/51 ต่อรอบบัญชี
    auditLog: []
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_DATA);
      return Object.assign(structuredClone(DEFAULT_DATA), JSON.parse(raw));
    } catch (e) { return structuredClone(DEFAULT_DATA); }
  }
  function save(data, action) {
    if (action) {
      data.auditLog.push({ ts: new Date().toISOString(), action });
      if (data.auditLog.length > 500) data.auditLog = data.auditLog.slice(-500);
    }
    localStorage.setItem(KEY, JSON.stringify(data));
  }
  function activeConfig(data) {
    return data.configOverride || (typeof DEFAULT_TAX_CONFIG !== "undefined" ? DEFAULT_TAX_CONFIG : null);
  }

  /* ---------- Export / Import ---------- */
  function exportJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ptc-tax-data-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importJSON(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      try { cb(null, Object.assign(structuredClone(DEFAULT_DATA), JSON.parse(r.result))); }
      catch (e) { cb(e); }
    };
    r.readAsText(file);
  }

  /* ---------- Google Drive sync (Google Identity Services) ----------
   * ใช้ scope drive.appdata (โฟลเดอร์ซ่อนเฉพาะแอป) — ผู้ใช้ต้องสร้าง
   * OAuth Client ID (Web) ใน Google Cloud Console แล้ววางในหน้าตั้งค่า
   * ดูขั้นตอนใน README.md
   * ---------------------------------------------------------------- */
  const DRIVE = {
    clientIdKey: "ptc-tax-gdrive-clientid",
    fileName: "ptc-tax-data.json",
    token: null,
    getClientId() { return localStorage.getItem(this.clientIdKey) || ""; },
    setClientId(v) { localStorage.setItem(this.clientIdKey, v.trim()); },

    ensureToken(cb) {
      const cid = this.getClientId();
      if (!cid) return cb(new Error("ยังไม่ได้ตั้งค่า Google OAuth Client ID (ดูหน้าตั้งค่า)"));
      if (typeof google === "undefined" || !google.accounts) {
        return cb(new Error("โหลด Google Identity Services ไม่สำเร็จ — ต้องต่ออินเทอร์เน็ต"));
      }
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: cid,
        scope: "https://www.googleapis.com/auth/drive.appdata",
        callback: (resp) => {
          if (resp.error) return cb(new Error(resp.error));
          DRIVE.token = resp.access_token; cb(null, resp.access_token);
        }
      });
      tc.requestAccessToken({ prompt: this.token ? "" : "consent" });
    },

    async findFile(token) {
      const q = encodeURIComponent("name='" + this.fileName + "'");
      const r = await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=" + q + "&fields=files(id,modifiedTime)",
        { headers: { Authorization: "Bearer " + token } });
      const j = await r.json();
      return (j.files && j.files[0]) || null;
    },

    async upload(data, cb) {
      this.ensureToken(async (err, token) => {
        if (err) return cb(err);
        try {
          const existing = await this.findFile(token);
          const meta = { name: this.fileName, parents: existing ? undefined : ["appDataFolder"] };
          const boundary = "ptcboundary";
          const body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(meta) + "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" +
            JSON.stringify(data) + "\r\n--" + boundary + "--";
          const url = "https://www.googleapis.com/upload/drive/v3/files" +
            (existing ? "/" + existing.id : "") + "?uploadType=multipart";
          const r = await fetch(url, {
            method: existing ? "PATCH" : "POST",
            headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + boundary },
            body
          });
          if (!r.ok) throw new Error("Drive upload ล้มเหลว: " + r.status);
          cb(null, await r.json());
        } catch (e) { cb(e); }
      });
    },

    async download(cb) {
      this.ensureToken(async (err, token) => {
        if (err) return cb(err);
        try {
          const f = await this.findFile(token);
          if (!f) return cb(new Error("ไม่พบไฟล์ข้อมูลใน Google Drive"));
          const r = await fetch("https://www.googleapis.com/drive/v3/files/" + f.id + "?alt=media",
            { headers: { Authorization: "Bearer " + token } });
          cb(null, await r.json());
        } catch (e) { cb(e); }
      });
    }
  };

  global.TaxStore = { load, save, activeConfig, exportJSON, importJSON, DRIVE, DEFAULT_DATA };
})(window);
