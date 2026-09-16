/*MNI:BEGIN v4*/
/* ============================================================
   ΕΙΣΑΓΩΓΗ ΔΕΔΟΜΕΝΩΝ — ΠΕΛΑΤΕΣ · ΠΡΟΜΗΘΕΥΤΕΣ · ΕΙΔΗ  (Φ28 · οδηγός Φ28β · .xls Φ28γ · πραγματικά Φ28δ)
   ------------------------------------------------------------
   Μία μηχανή, τρεις «συνταγές». Ο Λάμπρος φέρνει το αρχείο από το
   πρόγραμμα που δουλεύει σήμερα, αντιστοιχίζει στήλες, βλέπει τι
   θα μπει ΠΡΙΝ μπει, και πατάει ένα κουμπί.

   ΑΠΟΡΡΗΤΟ: τα εισαγμένα ζουν ΜΟΝΟ στο localStorage του browser του.
   Δεν γράφονται στο index.html, δεν ανεβαίνουν στο GitHub. Το repo
   είναι δημόσιο (DEC-MN-10) — τα στοιχεία χιλιάδων τρίτων όχι.

   ΑΝΟΙΧΤΟ ΠΑΡΑΘΥΡΟ ΜΟΡΦΩΝ: δεν ξέρουμε ακόμα τι μορφή δίνει το
   πρόγραμμά του. Κάθε μορφή είναι ΕΝΑΣ αναγνώστης στο MNI_READERS
   που επιστρέφει {cols:[...], rows:[[...]]}. Νέα μορφή = νέα
   εγγραφή εκεί. Τίποτα άλλο δεν αλλάζει.

   ΧΩΡΟΣ: 4.372 πελάτες × πλήρης καρτέλα δεν χωράνε στα ~5 MB.
   Οι εισαγμένες εγγραφές αποθηκεύονται ΜΟΝΟ με τα πεδία που έχουν
   τιμή· τα υπόλοιπα έρχονται από πρότυπο (prototype) με getters.
   Ό,τι γράψει ο χρήστης γίνεται κανονικό πεδίο και αποθηκεύεται.

   ΔΙΑΓΡΑΦΕΣ ΔΟΚΙΜΑΣΤΙΚΩΝ: το loadState ξαναπροσθέτει ό,τι λείπει
   από το SEED. Χωρίς «ταφόπλακες» (DATA._removed), οι ψεύτικοι
   πελάτες θα επέστρεφαν στο επόμενο άνοιγμα — το ίδιο σιωπηλό
   σφάλμα είχαν ήδη οι θέσεις, τα κέντρα και οι διαδρομές.
   ============================================================ */

var MNI_SEC = "Εισαγωγή δεδομένων";
var MNI_MAPKEY = "mn_import_map_v1";
var MNI = { type:null, file:"", fmt:"", cols:[], rows:[], map:{}, err:"", busy:false,
            mode:"merge", activeOnly:true, result:null, caption:"", grp:"auto", skipKinds:true };

/* ---------- ταφόπλακες (χρησιμοποιούνται και από το loadState) ---------- */
function mnIsRemoved(coll,key){
  var r = DATA && DATA._removed && DATA._removed[coll];
  return !!(r && r.indexOf(key) >= 0);
}
function mnTomb(coll,key){
  if(!SEED[coll] || !Array.isArray(SEED[coll])) return;
  var inSeed = SEED[coll].some(function(r){ return mniKey(r) === key; });
  if(!inSeed) return;
  DATA._removed = DATA._removed || {};
  var a = DATA._removed[coll] = DATA._removed[coll] || [];
  if(a.indexOf(key) < 0) a.push(key);
}
function mniUntomb(coll,key){
  var a = DATA._removed && DATA._removed[coll]; if(!a) return;
  var i = a.indexOf(key); if(i >= 0) a.splice(i,1);
}
function mniKey(r){ return r ? (r.code !== undefined ? r.code : r.id) : undefined; }

/* ---------- βοηθητικά ---------- */
function mniNorm(s){
  return String(s == null ? "" : s).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/ς/g,"σ")
    .replace(/[^a-z0-9α-ω]+/g," ").trim();
}
function mniToday(){ return new Date().toISOString().slice(0,10); }
function mniStr(v){ return v == null ? "" : String(v).replace(/\s+/g," ").trim(); }
function mniNum(v){
  if(v == null || v === "") return null;
  if(typeof v === "number") return isFinite(v) ? v : null;
  var s = String(v).replace(/[\s\u00A0€%]/g,"");
  if(!s) return null;
  if(s.indexOf(".") > -1 && s.indexOf(",") > -1){
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
  } else if(s.indexOf(",") > -1) s = s.replace(",",".");
  var n = Number(s); return isFinite(n) ? n : null;
}
var MNI_LAT = {"Α":"A","Β":"B","Ε":"E","Ζ":"Z","Η":"H","Ι":"I","Κ":"K","Μ":"M","Ν":"N","Ο":"O","Ρ":"P","Τ":"T","Υ":"Y","Χ":"X"};
function mniVat(v){
  var s = mniStr(v).toUpperCase().replace(/[\s.\-]/g,"");
  /* ξένα ΑΦΜ γραμμένα με ελληνικά κεφαλαία: «ΙΤ0272…» → «IT0272…» */
  if(/^[Α-ΩA-Z]{2}[0-9A-Z]/.test(s)) s = s.slice(0, 2).replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, function(c){ return MNI_LAT[c]; }) + s.slice(2);
  s = s.replace(/^(EL|GR)(?=\d{9}$)/, "");
  if(/^\d{8}$/.test(s)) s = "0" + s;      /* το Excel τρώει το αρχικό μηδέν */
  return s;
}
/* Κενό, μηδενικά ή σύντομος αριθμός (1–7 ψηφία) = δεν είναι ΑΦΜ */
function mniNoVat(v){ return !v || /^0+$/.test(v) || /^\d{1,7}$/.test(v); }
function mniZip(v){
  var s = mniStr(v), d = s.replace(/[\s.]/g, "");
  return /^\d{5}$/.test(d) ? d : s;           /* «455.00», «45.500» → 45500 */
}
function mniDate(v){
  var s = mniStr(v), n = Number(s), m;
  if(s && isFinite(n) && n > 20000 && n < 80000){
    var dt = new Date(Math.round((n - 25569) * 86400000));
    return dt.toISOString().slice(0, 10);
  }
  if((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))){
    var y = m[3].length === 2 ? "20" + m[3] : m[3];
    return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  }
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}
function mniAfmOk(v){
  if(!/^\d{9}$/.test(v) || v === "000000000") return false;
  var s = 0; for(var i = 0; i < 8; i++) s += (+v[i]) * Math.pow(2, 8 - i);
  return (s % 11) % 10 === +v[8];
}
function mniTel(v){
  var s = mniStr(v); if(/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/,"");
  return s;
}
function mniStatus(v){
  var n = mniNorm(v);
  if(!n) return null;
  if(["οχι","0","false","no","ο","ανενεργοσ","ανενεργη","ανενεργο","inactive","n"].indexOf(n) >= 0) return false;
  if(["ναι","1","true","yes","ν","ενεργοσ","ενεργη","ενεργο","active","y"].indexOf(n) >= 0) return true;
  if(n.indexOf("ανενεργ") >= 0 || n.indexOf("διαγραμ") >= 0) return false;
  if(n.indexOf("ενεργ") >= 0) return true;
  return null;
}
var MNI_UNITS = ["m²","m³","μ.μ.","τεμ.","τόνοι","φορτίο","παλέτα","kg"];
function mniUnit(v){
  if(MNI_UNITS.indexOf(v) >= 0) return v;        /* ήδη κανονική μονάδα — το «²» χάνεται στην κανονικοποίηση */
  var raw = String(v == null ? "" : v).toLowerCase();
  if(/[mμ]\s*²|[mμ]2\b/.test(raw)) return "m²";
  if(/[mμ]\s*³|[mμ]3\b/.test(raw)) return "m³";
  var n = mniNorm(v);
  if(!n) return "";
  if(/^(τμ|μ2|m2|τ μ|sqm|τετραγωνικ)/.test(n)) return "m²";
  if(/^(μμ|μ μ|τρεχ|lm|m$|μετρ)/.test(n)) return "μ.μ.";
  if(/^(τεμ|τμχ|pcs|pc|τεμαχ)/.test(n)) return "τεμ.";
  if(/^(τονν|τον|tn|t$)/.test(n)) return "τόνοι";
  if(/^(m3|μ3|κυβ)/.test(n)) return "m³";
  if(/^(kg|κιλ)/.test(n)) return "kg";
  return mniStr(v);
}
function mniSlug(s){ return mniNorm(s).replace(/\s+/g,"-").slice(0,40) || "x"; }
function mniErr(m){ var e = new Error(m); e.mni = true; return e; }

/* ============================================================
   ΑΝΑΓΝΩΣΤΕΣ ΜΟΡΦΩΝ — το «ανοιχτό παράθυρο»
   Κάθε αναγνώστης: test(όνομα, bytes) → true/false
                    read(bytes, όνομα) → Promise<{cols, rows, caption?}>
   ============================================================ */
var MNI_READERS = [
  { id:"xlsx", label:"Excel (.xlsx)",
    test:function(n,b){ return b[0] === 0x50 && b[1] === 0x4B; },
    read:function(b){ return mniReadXlsx(b); } },
  { id:"xls", label:"Excel 97–2003 (.xls)",
    test:function(n,b){ return b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0; },
    read:function(b){ return Promise.resolve(mniReadXls(b)); } },
  { id:"json", label:"JSON",
    test:function(n,b){ return /\.json$/i.test(n) || mniFirstChar(b) === "{" || mniFirstChar(b) === "["; },
    read:function(b){ return Promise.resolve(mniReadJson(mniText(b))); } },
  { id:"xml", label:"XML",
    test:function(n,b){ return /\.xml$/i.test(n) || mniFirstChar(b) === "<"; },
    read:function(b){ return Promise.resolve(mniReadXml(mniText(b))); } },
  { id:"csv", label:"CSV / κείμενο",
    test:function(){ return true; },   /* τελευταία λύση */
    read:function(b){ return Promise.resolve(mniReadCsv(mniText(b))); } }
];

function mniText(b){
  if(b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if(b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder("utf-16be").decode(b.subarray(2));
  var s = (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) ? b.subarray(3) : b;
  try { return new TextDecoder("utf-8", {fatal:true}).decode(s); }
  catch(e){ return new TextDecoder("windows-1253").decode(s); }  /* ελληνικά προγράμματα */
}
function mniFirstChar(b){
  var s = (b[0] === 0xEF && b[1] === 0xBB) ? 3 : 0;
  for(var i = s; i < Math.min(b.length, s + 200); i++){
    var c = b[i]; if(c !== 32 && c !== 9 && c !== 10 && c !== 13) return String.fromCharCode(c);
  }
  return "";
}

/* ---------- CSV ---------- */
function mniReadCsv(t){
  var first = t.split(/\r?\n/)[0] || "";
  var cands = [";", ",", "\t", "|"], best = ",", bn = -1;
  cands.forEach(function(d){ var n = first.split(d).length; if(n > bn){ bn = n; best = d; } });
  var rows = [], row = [], cell = "", q = false;
  for(var i = 0; i < t.length; i++){
    var c = t[i];
    if(q){
      if(c === '"'){ if(t[i+1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if(c === '"') q = true;
    else if(c === best){ row.push(cell); cell = ""; }
    else if(c === "\n" || c === "\r"){
      if(c === "\r" && t[i+1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if(cell !== "" || row.length){ row.push(cell); rows.push(row); }
  return mniTable(rows);
}
/* Πρώτη γραμμή με ≥2 μη κενά κελιά = επικεφαλίδες */
function mniTable(rows){
  rows = rows.filter(function(r){ return r.some(function(x){ return mniStr(x) !== ""; }); });
  var h = 0;
  while(h < rows.length && rows[h].filter(function(x){ return mniStr(x) !== ""; }).length < 2) h++;
  if(h >= rows.length) throw mniErr("Δεν βρέθηκε γραμμή επικεφαλίδων με ονόματα στηλών.");
  var cols = rows[h].map(function(x, i){ return mniStr(x) || ("Στήλη " + (i + 1)); });
  return { cols:cols, rows:rows.slice(h + 1) };
}

/* ---------- JSON (και η μορφή TCustomer / Data του προγράμματός του) ---------- */
function mniReadJson(t){
  var d; try { d = JSON.parse(t); } catch(e){ throw mniErr("Το αρχείο JSON δεν διαβάζεται: " + e.message); }
  var best = null, cap = "";
  (function walk(o, parent){
    if(Array.isArray(o)){
      if(o.length && o.every(function(x){ return x && typeof x === "object" && !Array.isArray(x); })){
        if(!best || o.length > best.length){ best = o; cap = parent && parent.Caption || ""; }
      } else if(o.length && Array.isArray(o[0]) && (!best || o.length > best.length)){ best = o; }
      o.forEach(function(x){ if(x && typeof x === "object") walk(x, null); });
    } else if(o && typeof o === "object"){
      for(var k in o) if(o[k] && typeof o[k] === "object") walk(o[k], o);
    }
  })(d, null);
  if(!best) throw mniErr("Το αρχείο JSON δεν περιέχει λίστα εγγραφών.");
  if(Array.isArray(best[0])){ var tb = mniTable(best); tb.caption = cap; return tb; }
  var cols = [], seen = {};
  best.forEach(function(r){ for(var k in r) if(!seen[k]){ seen[k] = 1; cols.push(k); } });
  var rows = best.map(function(r){
    return cols.map(function(k){ var v = r[k]; return v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : v); });
  });
  return { cols:cols, rows:rows, caption:cap };
}

/* ---------- XML (γενικό: ο γονέας με τα περισσότερα ίδια παιδιά) ---------- */
function mniReadXml(t){
  var doc = new DOMParser().parseFromString(t, "application/xml");
  if(doc.getElementsByTagName("parsererror").length) throw mniErr("Το αρχείο XML δεν διαβάζεται.");
  var bestEl = null, bestN = 0, bestTag = "";
  var all = doc.getElementsByTagName("*");
  for(var i = 0; i < all.length; i++){
    var cnt = {}, ch = all[i].children;
    for(var j = 0; j < ch.length; j++){ var tg = ch[j].tagName; cnt[tg] = (cnt[tg] || 0) + 1; }
    for(var tg2 in cnt) if(cnt[tg2] > bestN){ bestN = cnt[tg2]; bestEl = all[i]; bestTag = tg2; }
  }
  if(!bestEl || bestN < 1) throw mniErr("Το αρχείο XML δεν περιέχει επαναλαμβανόμενες εγγραφές.");
  var recs = [], cols = [], seen = {};
  Array.prototype.forEach.call(bestEl.children, function(el){
    if(el.tagName !== bestTag) return;
    var r = {};
    Array.prototype.forEach.call(el.attributes, function(a){ r[a.name] = a.value; });
    Array.prototype.forEach.call(el.children, function(c){ if(!c.children.length) r[c.tagName] = c.textContent; });
    for(var k in r) if(!seen[k]){ seen[k] = 1; cols.push(k); }
    recs.push(r);
  });
  return { cols:cols, rows:recs.map(function(r){ return cols.map(function(k){ return r[k] == null ? "" : r[k]; }); }) };
}

/* ---------- XLSX: zip + XML, χωρίς εξωτερική βιβλιοθήκη ---------- */
async function mniUnzip(u){
  var dv = new DataView(u.buffer, u.byteOffset, u.byteLength), eocd = -1;
  for(var i = u.length - 22; i >= Math.max(0, u.length - 65557); i--){
    if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw mniErr("Το αρχείο Excel φαίνεται κατεστραμμένο.");
  var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), files = {};
  for(var k = 0; k < n; k++){
    if(dv.getUint32(p, true) !== 0x02014b50) break;
    var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    var nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    var lho = dv.getUint32(p + 42, true);
    var name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nlen));
    files[name] = { method:method, csize:csize, lho:lho };
    p += 46 + nlen + elen + clen;
  }
  return async function(name){
    var f = files[name]; if(!f) return null;
    var st = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
    var data = u.slice(st, st + f.csize);
    if(f.method === 0) return new TextDecoder().decode(data);
    if(f.method !== 8) throw mniErr("Άγνωστη συμπίεση μέσα στο Excel.");
    if(typeof DecompressionStream === "undefined")
      throw mniErr("Ο browser δεν ανοίγει αρχεία Excel. Χρησιμοποιήστε Chrome/Edge/Firefox πρόσφατης έκδοσης ή αποθηκεύστε ως CSV.");
    var out = await new Response(new Response(data).body.pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
    return new TextDecoder().decode(out);
  };
}
function mniXml(t){ return new DOMParser().parseFromString(t, "application/xml"); }
function mniTags(el, name){ return el.getElementsByTagNameNS("*", name); }
async function mniReadXlsx(u){
  var get = await mniUnzip(u);
  var shared = [], ss = await get("xl/sharedStrings.xml");
  if(ss){
    Array.prototype.forEach.call(mniTags(mniXml(ss), "si"), function(si){
      var t = ""; Array.prototype.forEach.call(mniTags(si, "t"), function(x){ t += x.textContent; });
      shared.push(t);
    });
  }
  /* πρώτο φύλλο κατά σειρά βιβλίου εργασίας */
  var path = "xl/worksheets/sheet1.xml", wb = await get("xl/workbook.xml"), rels = await get("xl/_rels/workbook.xml.rels");
  var sheetName = "";
  if(wb && rels){
    var sh = mniTags(mniXml(wb), "sheet")[0];
    if(sh){
      sheetName = sh.getAttribute("name") || "";
      var rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      Array.prototype.forEach.call(mniTags(mniXml(rels), "Relationship"), function(r){
        if(r.getAttribute("Id") === rid){
          var tg = r.getAttribute("Target").replace(/^\/?xl\//, "");
          path = "xl/" + tg.replace(/^\//, "");
        }
      });
    }
  }
  var sx = await get(path);
  if(!sx) throw mniErr("Δεν βρέθηκε φύλλο δεδομένων μέσα στο Excel.");
  var rows = [];
  Array.prototype.forEach.call(mniTags(mniXml(sx), "row"), function(r){
    var arr = [];
    Array.prototype.forEach.call(mniTags(r, "c"), function(c){
      var ref = c.getAttribute("r") || "", col = 0, m = ref.match(/^[A-Z]+/);
      if(m){ for(var i = 0; i < m[0].length; i++) col = col * 26 + (m[0].charCodeAt(i) - 64); col--; }
      else col = arr.length;
      var t = c.getAttribute("t"), v = mniTags(c, "v")[0], val = "";
      if(t === "s") val = v ? (shared[+v.textContent] || "") : "";
      else if(t === "inlineStr"){ Array.prototype.forEach.call(mniTags(c, "t"), function(x){ val += x.textContent; }); }
      else if(t === "b") val = v && v.textContent === "1" ? "Ναι" : "Όχι";
      else val = v ? v.textContent : "";
      while(arr.length < col) arr.push("");
      arr[col] = val;
    });
    rows.push(arr);
  });
  var tb = mniTable(rows); tb.caption = sheetName; return tb;
}

/* ---------- XLS (Excel 97–2003, BIFF8) — χωρίς εξωτερική βιβλιοθήκη ----------
   Το πρόγραμμα του πελάτη εξάγει γνήσιο .xls. Δύο στρώματα:
   (1) OLE2 / Compound File: ένα «μικρό σύστημα αρχείων» μέσα στο αρχείο,
       από όπου διαβάζουμε το ρεύμα «Workbook».
   (2) BIFF8: σειρά εγγραφών (τύπος, μήκος, δεδομένα). Κρατάμε μόνο όσες
       περιέχουν τιμές κελιών του πρώτου φύλλου.                              */
function mniCfb(u){
  var dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  var bad = function(){ return mniErr("Το αρχείο .xls φαίνεται κατεστραμμένο ή είναι σε άγνωστη παλιά μορφή. Ανοίξτε το στο Excel και αποθηκεύστε το ως «Βιβλίο εργασίας Excel (.xlsx)»."); };
  if(u.length < 512 || dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1) throw bad();
  var ssz = 1 << dv.getUint16(30, true), mssz = 1 << dv.getUint16(32, true);
  var dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
  var mfStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true), nDif = dv.getUint32(72, true);
  var END = 0xFFFFFFFA;
  var off = function(s){ return (s + 1) * ssz; };
  var fatSecs = [];
  for(var i = 0; i < 109; i++){ var v = dv.getUint32(76 + i * 4, true); if(v < END) fatSecs.push(v); }
  for(var d = difStart, g = 0; d < END && g <= nDif; g++){
    if(off(d) + ssz > u.length) throw bad();
    for(var j = 0; j < ssz / 4 - 1; j++){ var v2 = dv.getUint32(off(d) + j * 4, true); if(v2 < END) fatSecs.push(v2); }
    d = dv.getUint32(off(d) + ssz - 4, true);
  }
  var fat = [];
  fatSecs.forEach(function(s){
    if(off(s) + ssz > u.length) throw bad();
    for(var k = 0; k < ssz / 4; k++) fat.push(dv.getUint32(off(s) + k * 4, true));
  });
  var chain = function(start, table){
    var out = [], s = start, n = 0;
    while(s < END && n++ <= table.length){ out.push(s); s = table[s]; }
    return out;
  };
  var readChain = function(start, size){
    var secs = chain(start, fat), buf = new Uint8Array(secs.length * ssz);
    secs.forEach(function(s, i){ if(off(s) + ssz <= u.length) buf.set(u.subarray(off(s), off(s) + ssz), i * ssz); });
    return size != null ? buf.subarray(0, Math.min(size, buf.length)) : buf;
  };
  var dir = readChain(dirStart), dd = new DataView(dir.buffer), ents = [];
  for(var e = 0; e + 128 <= dir.length; e += 128){
    var nl = dd.getUint16(e + 64, true), name = "";
    for(var c = 0; c < nl / 2 - 1; c++) name += String.fromCharCode(dd.getUint16(e + c * 2, true));
    ents.push({name:name, type:dir[e + 66], start:dd.getUint32(e + 116, true), size:dd.getUint32(e + 120, true)});
  }
  if(!ents.length) throw bad();
  return function(want){
    var en = ents.filter(function(x){ return x.type === 2 && x.name.toLowerCase() === want.toLowerCase(); })[0];
    if(!en) return null;
    if(en.size >= cutoff) return readChain(en.start, en.size);
    var ms = readChain(ents[0].start, ents[0].size), mf = readChain(mfStart), mdv = new DataView(mf.buffer), mfat = [];
    for(var k2 = 0; k2 + 4 <= mf.length; k2 += 4) mfat.push(mdv.getUint32(k2, true));
    var secs = chain(en.start, mfat), buf = new Uint8Array(secs.length * mssz);
    secs.forEach(function(s, i){ buf.set(ms.subarray(s * mssz, (s + 1) * mssz), i * mssz); });
    return buf.subarray(0, en.size);
  };
}
function mniRk(dv, p){
  var v = dv.getInt32(p, true), n;
  if(v & 2) n = v >> 2;
  else {
    var b = new DataView(new ArrayBuffer(8));
    b.setUint32(0, 0, true); b.setUint32(4, (v >>> 0) & 0xFFFFFFFC, true);
    n = b.getFloat64(0, true);
  }
  return (v & 1) ? n / 100 : n;
}
function mniNumStr(n){
  if(!isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e10) / 1e10);
}
function mniXlsStr(dv, p, cchSize){
  var cch = cchSize === 2 ? dv.getUint16(p, true) : dv.getUint8(p); p += cchSize;
  var fl = dv.getUint8(p++), s = "";
  if(fl & 8) p += 2;            /* rich runs */
  if(fl & 4) p += 4;            /* ext */
  for(var i = 0; i < cch; i++){
    if(fl & 1){ s += String.fromCharCode(dv.getUint16(p, true)); p += 2; }
    else s += String.fromCharCode(dv.getUint8(p++));
  }
  return s;
}
function mniReadXls(u){
  var get = mniCfb(u);
  var wb = get("Workbook") || get("Book");
  if(!wb) throw mniErr("Το αρχείο .xls δεν περιέχει φύλλο εργασίας. Ανοίξτε το στο Excel και αποθηκεύστε το ως .xlsx.");
  var dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength), L = wb.length;
  var rec = function(p){ return {t:dv.getUint16(p, true), n:dv.getUint16(p + 2, true), d:p + 4}; };
  /* --- global εγγραφές --- */
  var p = 0, sheets = [], sstSegs = null, first = true;
  while(p + 4 <= L){
    var r = rec(p);
    if(first){
      if(r.t !== 0x0809 || dv.getUint16(r.d, true) !== 0x0600)
        throw mniErr("Το αρχείο είναι σε πολύ παλιά μορφή Excel (95 ή παλιότερη). Ανοίξτε το στο Excel και αποθηκεύστε το ως .xlsx.");
      first = false;
    } else if(r.t === 0x0085){
      sheets.push({pos:dv.getUint32(r.d, true), hidden:dv.getUint8(r.d + 4), kind:dv.getUint8(r.d + 5),
                   name:mniXlsStr(dv, r.d + 6, 1)});
    } else if(r.t === 0x00FC){
      sstSegs = [wb.subarray(r.d, r.d + r.n)];
      var q = r.d + r.n;
      while(q + 4 <= L && dv.getUint16(q, true) === 0x003C){
        var cn = dv.getUint16(q + 2, true);
        sstSegs.push(wb.subarray(q + 4, q + 4 + cn)); q += 4 + cn;
      }
    } else if(r.t === 0x000A) break;
    p = r.d + r.n;
  }
  /* --- πίνακας κοινών κειμένων (SST), με συνέχειες σε CONTINUE --- */
  var sst = [];
  if(sstSegs){
    var si = 0, sp = 0;
    var u8 = function(){ while(sp >= sstSegs[si].length){ si++; sp = 0; } return sstSegs[si][sp++]; };
    var u16 = function(){ var a = u8(); return a | (u8() << 8); };
    var u32 = function(){ return (u16() + u16() * 65536) >>> 0; };
    var skip = function(n){ while(n-- > 0) u8(); };
    var total = u32(), uniq = u32();
    for(var k = 0; k < uniq; k++){
      if(si >= sstSegs.length - 1 && sp >= sstSegs[si].length) break;
      var cch = u16(), fl = u8(), hi = fl & 1, runs = (fl & 8) ? u16() : 0, ext = (fl & 4) ? u32() : 0, s = "";
      while(cch > 0){
        if(sp >= sstSegs[si].length){ si++; sp = 0; hi = sstSegs[si][sp++] & 1; }
        var seg = sstSegs[si], bp = hi ? 2 : 1, n = Math.min(cch, Math.floor((seg.length - sp) / bp));
        if(n <= 0){ si++; sp = 0; hi = sstSegs[si][sp++] & 1; continue; }
        for(var c = 0; c < n; c++){
          s += String.fromCharCode(hi ? (seg[sp] | (seg[sp + 1] << 8)) : seg[sp]);
          sp += bp;
        }
        cch -= n;
      }
      skip(runs * 4); skip(ext);
      sst.push(s);
    }
  }
  /* --- πρώτο ορατό φύλλο εργασίας --- */
  var sh = sheets.filter(function(x){ return x.kind === 0 && x.hidden === 0; })[0] || sheets[0];
  if(!sh) throw mniErr("Το αρχείο .xls δεν περιέχει φύλλο εργασίας.");
  var rows = [], put = function(r, c, v){ (rows[r] = rows[r] || [])[c] = v; };
  p = sh.pos;
  var pendingStr = null;
  while(p + 4 <= L){
    var w = rec(p), x = w.d;
    if(w.t === 0x000A) break;
    switch(w.t){
      case 0x00FD: put(dv.getUint16(x, true), dv.getUint16(x + 2, true), sst[dv.getUint32(x + 6, true)] || ""); break;
      case 0x0204: case 0x00D6: put(dv.getUint16(x, true), dv.getUint16(x + 2, true), mniXlsStr(dv, x + 6, 2)); break;
      case 0x0203: put(dv.getUint16(x, true), dv.getUint16(x + 2, true), mniNumStr(dv.getFloat64(x + 6, true))); break;
      case 0x027E: put(dv.getUint16(x, true), dv.getUint16(x + 2, true), mniNumStr(mniRk(dv, x + 6))); break;
      case 0x00BD:
        var rr = dv.getUint16(x, true), cf = dv.getUint16(x + 2, true), cnt = (w.n - 6) / 6;
        for(var m = 0; m < cnt; m++) put(rr, cf + m, mniNumStr(mniRk(dv, x + 4 + m * 6 + 2)));
        break;
      case 0x0205:
        put(dv.getUint16(x, true), dv.getUint16(x + 2, true),
            dv.getUint8(x + 7) ? "" : (dv.getUint8(x + 6) ? "Ναι" : "Όχι"));
        break;
      case 0x0006:
        var fr = dv.getUint16(x, true), fc = dv.getUint16(x + 2, true);
        if(dv.getUint16(x + 12, true) === 0xFFFF){
          var kind = dv.getUint8(x + 6);
          if(kind === 0) pendingStr = [fr, fc];
          else if(kind === 1) put(fr, fc, dv.getUint8(x + 8) ? "Ναι" : "Όχι");
          else put(fr, fc, "");
        } else put(fr, fc, mniNumStr(dv.getFloat64(x + 6, true)));
        break;
      case 0x0207:
        if(pendingStr){ put(pendingStr[0], pendingStr[1], mniXlsStr(dv, x, 2)); pendingStr = null; }
        break;
    }
    p = x + w.n;
  }
  for(var i2 = 0; i2 < rows.length; i2++){
    rows[i2] = rows[i2] || [];
    for(var j2 = 0; j2 < rows[i2].length; j2++) if(rows[i2][j2] === undefined) rows[i2][j2] = "";
  }
  var tb = mniTable(rows); tb.caption = sh.name; return tb;
}

/* ============================================================
   ΣΥΝΤΑΓΕΣ — τι πεδία δέχεται κάθε είδος και με ποια ονόματα
   ============================================================ */
function mniF(k,l,syn,o){ var f = {k:k, l:l, syn:syn}; for(var x in (o||{})) f[x] = o[x]; return f; }
var MNI_PARTY_FIELDS = function(who){ return [
  mniF("ext","Κωδικός στο πρόγραμμα",["κωδικός "+who,"κωδικός","κωδ","code","id","α/α"],{not:["ταχ","τ.κ","αφμ","δου","άρθρ","barcode","πωλητ","ομίλ"]}),
  mniF("name","Επωνυμία",["επωνυμία","ονοματεπώνυμο","ονομασία","επώνυμο",who,"name","company"],{req:true, not:["διακριτ","πωλητ","ομίλ"]}),
  mniF("brand","Διακριτικός τίτλος",["διακριτικός τίτλος","διακριτικός","τίτλος","brand"]),
  mniF("vat","ΑΦΜ",["αφμ","α.φ.μ","vat","tax id","tin"],{t:"vat"}),
  mniF("doy","ΔΟΥ",["δου","δ.ο.υ","εφορία","tax office"]),
  mniF("kad","Επάγγελμα",["επάγγελμα","δραστηριότητα","καδ","occupation"]),
  mniF("cat","Κατηγορία",["κατηγορία "+who,"κατηγορία","ομάδα","group","category"]),
  mniF("addr","Διεύθυνση",["διεύθυνση","οδός","address","street"]),
  mniF("zip","Τ.Κ.",["ταχυδρομικός κώδικας","τ.κ","τκ","ταχ. κωδ","zip","postal"],{t:"zip"}),
  mniF("city","Πόλη",["πόλη","περιοχή","δήμος","city","town"]),
  mniF("country","Χώρα",["χώρα","country"]),
  mniF("tel","Τηλέφωνο",["τηλέφωνο","τηλ","phone","tel"],{t:"tel", not:["κινητ","fax","φαξ"]}),
  mniF("mob","Κινητό",["κινητό","mobile","cell"],{t:"tel"}),
  mniF("email","Email",["email","e-mail","ηλεκτρονικό ταχυδρομείο","mail"]),
  mniF("web","Ιστοσελίδα",["ιστοσελίδα","website","web","site"]),
  mniF("contact","Πρόσωπο επικοινωνίας",["υπεύθυνος επικοινωνίας","υπεύθυνος","επαφή","contact"]),
  mniF("payTerms","Τρόπος πληρωμής",["τρόπος πληρωμής","πληρωμή","payment"]),
  mniF("balance","Υπόλοιπο (€)",["υπόλοιπο","balance"],{t:"num"}),
  mniF("credit","Πιστωτικό όριο (€)",["πιστωτικό όριο","όριο πίστωσης","credit"],{t:"num"}),
  mniF("status","Ενεργός / Ανενεργός",["ενεργός","ενεργή","κατάσταση","ανενεργός","active","status"],{t:"status"}),
  mniF("owner","Υπεύθυνος πωλητής",["επωνυμία πωλητή","πωλητής","υπεύθυνος πωλητής","salesman"]),
  mniF("first","Ημερομηνία καταχώρησης",["ημ/νία καταχώρησης","ημερομηνία καταχώρησης","ημ/νία δημιουργίας","ημερομηνία εγγραφής","created"],{t:"date"}),
  mniF("notes","Σημειώσεις",["σημειώσεις","σχόλια","παρατηρήσεις","notes","remarks"])
]; };

var MNI_RECIPES = {
  customers:{ label:"Πελάτες", many:"πελάτες", coll:"customers", prefix:"CL-", replace:true,
    open:function(){ goSec("crm","Πελάτες"); },
    fields:MNI_PARTY_FIELDS("πελάτη").concat([]) },
  suppliers:{ label:"Προμηθευτές", many:"προμηθευτές", coll:"suppliers", prefix:"SL-", replace:true,
    open:function(){ goSec("crm","Προμηθευτές"); },
    fields:MNI_PARTY_FIELDS("προμηθευτή").concat([
      mniF("iban","IBAN",["iban","λογαριασμός","τραπεζικός λογαριασμός"]) ]) },
  products:{ label:"Είδη αποθήκης", many:"είδη", coll:"products", prefix:"PX-", replace:false,
    open:function(){ goSec("admin","Προϊόντα"); },
    fields:[
      mniF("ext","Κωδικός είδους",["κωδικός είδους","κωδικός","κωδ","sku","code","id"],{not:["barcode","ταχ","ομάδ","βοηθ","εργοστ"]}),
      mniF("name","Περιγραφή",["περιγραφή είδους","περιγραφή","ονομασία","είδος","name","description"],{req:true}),
      mniF("group","Ομάδα",["ομάδα είδους","ομάδα","κατηγορία","οικογένεια","group","category"]),
      mniF("kind","Λογιστικός χαρακτηρισμός",["λογ. χαρ/μός","λογιστικός χαρακτηρισμός","χαρακτηρισμός","λογ χαρ"]),
      mniF("barcode","Barcode",["barcode","ean"]),
      mniF("unit","Μονάδα μέτρησης",["μονάδα μέτρησης","μ.μ.","μονάδα","μον","unit"]),
      mniF("form","Μορφή",["μορφή","τύπος","form"]),
      mniF("th","Πάχος (cm)",["πάχος","thickness"],{t:"num"}),
      mniF("dims","Διαστάσεις",["διαστάσεις","dimensions"]),
      mniF("fin","Φινίρισμα",["φινίρισμα","επιφάνεια","finish"]),
      mniF("price","Τιμή πώλησης (€)",["τιμή πώλησης","τιμή λιανικής","τιμή χονδρικής","τιμή","price"],{t:"num", not:["κόστ","αγορ"]}),
      mniF("cost","Τιμή κόστους (€)",["τιμή κόστους","κόστος","τιμή αγοράς","cost"],{t:"num"}),
      mniF("vatRate","ΦΠΑ (%)",["φπα","vat rate"],{t:"num"}),
      mniF("stock","Απόθεμα",["απόθεμα","υπόλοιπο","ποσότητα","stock","qty"],{t:"num"}),
      mniF("supplier","Προμηθευτής",["προμηθευτής","supplier"]),
      mniF("status","Ενεργό / Ανενεργό",["ενεργό","ενεργός","κατάσταση","ανενεργό","active","status"],{t:"status"})
    ] }
};
/* ελληνικά με τόνους στις συνταγές — κανονικοποίηση μία φορά */
for(var _mt in MNI_RECIPES) MNI_RECIPES[_mt].fields.forEach(function(f){
  f.nsyn = f.syn.map(mniNorm); f.nnot = (f.not || []).map(mniNorm);
});

/* ---------- πρότυπα κενών τιμών (δεν αποθηκεύονται) ---------- */
var MNI_DEF = {
  customers:{ name:"", brand:"", type:"Εταιρεία", cat:"Χωρίς κατηγορία", vat:"—", doy:"—", gemi:"—", kad:"—",
    addr:"—", zip:"—", city:"—", country:"Ελλάδα", ship:"Ίδια με έδρα", tel:"", mob:"", wa:"", waSame:false,
    viber:"", email:"", emailFin:"", web:"", fb:"", ig:"", li:"", tiktok:"", prefer:"Τηλέφωνο",
    lang:"Ελληνικά", hours:"—", source:"Εισαγωγή", referrer:"", campaign:"", owner:"—", first:"—",
    firstOrder:"—", priceList:"Λιανική", discount:0, credit:0, payTerms:"Μετρητά", payDays:0,
    balance:0, overdue:0, delivery:"Παραλαβή από την έδρα μας", incoterm:"—", status:"Ενεργός",
    grade:"—", rating:3, revYear:0, revTotal:0, orders:0, avgOrder:0, lastOrder:"", dso:0,
    favStones:[], gdpr:{marketing:false, date:"", basis:"Σύμβαση"}, notes:"",
    contacts:[], samples:[], acts:[], docs:[], extra:[] },
  suppliers:{ name:"", brand:"", type:"Εταιρεία", cat:"Χωρίς κατηγορία", crit:"—", vat:"—", doy:"—",
    gemi:"—", kad:"—", addr:"—", zip:"—", city:"—", country:"Ελλάδα", tel:"", mob:"", wa:"",
    email:"", web:"", fb:"", ig:"", li:"", prefer:"Τηλέφωνο", lang:"Ελληνικά", hours:"—",
    since:"—", owner:"—", currency:"EUR", payTerms:"Μετρητά", payDays:0, credit:0, balance:0,
    overdue:0, leadTime:0, moq:"—", incoterm:"—", transport:"—", bank:"—", iban:"", swift:"",
    rQuality:3, rDelivery:3, rPrice:3, rService:3, certs:[], status:"Ενεργός", notes:"",
    contacts:[], acts:[], docs:[], extra:[] },
  products:{ name:"", petro:"—", family:"Χωρίς ομάδα", colour:"", variation:"—",
    origin:{country:"", region:"", quarry:""}, own:false, supplier:"", status:"Ενεργό",
    created:"", updated:"",
    tech:{density:null, porosity:null, absorb:null, compressive:null, flexural:null,
          abrasion:null, frost:"—", thermal:"—", fire:"—", mohs:null},
    finishes:[], variants:[], priceHistory:[], sup:[],
    compliance:{en:"—", dop:"", test:"", testDate:"", lab:"", ce:false, gwp:null, epd:"", dpp:""},
    web:{slug:"", pub:false, title:"", desc:""}, media:[], notes:"" }
};
var MNI_PROTO = {};
(function(){
  Object.keys(MNI_DEF).forEach(function(t){
    var P = {};
    Object.keys(MNI_DEF[t]).forEach(function(k){
      var d = MNI_DEF[t][k], obj = d !== null && typeof d === "object";
      var own = function(self, v){ Object.defineProperty(self, k, {value:v, writable:true, enumerable:true, configurable:true}); };
      /* Ο διακριτικός τίτλος = η επωνυμία, αν δεν δόθηκε — χωρίς να αποθηκεύεται δύο φορές */
      if(k === "brand"){
        Object.defineProperty(P, k, {configurable:true, enumerable:false,
          get:function(){ return Object.prototype.hasOwnProperty.call(this, "name") ? this.name : ""; },
          set:function(v){ own(this, v); }});
        return;
      }
      /* Το ιστορικό ξεκινά με την εισαγωγή — από τα στοιχεία της παρτίδας, όχι αντίγραφο σε κάθε εγγραφή */
      if(k === "acts"){
        Object.defineProperty(P, k, {configurable:true, enumerable:false,
          get:function(){
            var b = DATA && DATA._imp && DATA._imp.batches && DATA._imp.batches[this.imp];
            var v = [{d:b ? b.at.slice(0, 10) : "", t:"Εισαγωγή", txt:"Από " + (b ? b.file : "αρχείο")}];
            own(this, v); return v;
          },
          set:function(v){ own(this, v); }});
        return;
      }
      Object.defineProperty(P, k, {
        configurable:true, enumerable:false,
        get:function(){
          if(!obj) return d;
          /* πίνακες/αντικείμενα: γίνονται δικά της στην πρώτη ανάγνωση,
             ώστε ένα push να μη μοιράζεται ανάμεσα σε εγγραφές */
          var v = JSON.parse(JSON.stringify(d));
          Object.defineProperty(this, k, {value:v, writable:true, enumerable:true, configurable:true});
          return v;
        },
        set:function(v){ Object.defineProperty(this, k, {value:v, writable:true, enumerable:true, configurable:true}); }
      });
    });
    MNI_PROTO[t] = P;
  });
})();
function mniHydrateAll(){
  if(!DATA) return;
  Object.keys(MNI_PROTO).forEach(function(t){
    (DATA[t] || []).forEach(function(r){
      if(r && r.imp && Object.getPrototypeOf(r) !== MNI_PROTO[t]) Object.setPrototypeOf(r, MNI_PROTO[t]);
    });
  });
}
/* Φόρτωση: μετά το κανονικό loadState, οι εισαγμένες ξαναπαίρνουν πρότυπο */
var _mniLoadState = loadState;
loadState = function(){ _mniLoadState(); mniHydrateAll(); };

/* ============================================================
   ΑΝΤΙΣΤΟΙΧΙΣΗ ΣΤΗΛΩΝ
   ============================================================ */
function mniAutoMap(type, cols){
  var R = MNI_RECIPES[type], cands = [];
  cols.forEach(function(c, ci){
    var h = mniNorm(c); if(!h) return;
    R.fields.forEach(function(f, fi){
      if(f.nnot.some(function(x){ return x && h.indexOf(x) >= 0; })) return;
      var best = 0;
      f.nsyn.forEach(function(s, si){
        if(!s) return;
        var sc = 0;
        if(h === s) sc = 100;
        else if(h.indexOf(s + " ") === 0 || h.slice(-(s.length + 1)) === " " + s) sc = 60;
        else if(s.length >= 3 && h.indexOf(s) >= 0) sc = 30;
        else if(s.length <= 3 && h.split(" ").indexOf(s) >= 0) sc = 40;
        if(sc) sc -= si * 0.5;
        if(sc > best) best = sc;
      });
      if(best > 0) cands.push({ci:ci, f:f.k, sc:best, fi:fi});
    });
  });
  cands.sort(function(a, b){ return b.sc - a.sc || a.fi - b.fi || a.ci - b.ci; });
  var map = {}, usedF = {};
  cands.forEach(function(c){ if(map[c.ci] === undefined && !usedF[c.f]){ map[c.ci] = c.f; usedF[c.f] = 1; } });
  /* μνήμη: ό,τι διόρθωσε ο χρήστης την προηγούμενη φορά */
  var mem = {}; try { mem = (JSON.parse(localStorage.getItem(MNI_MAPKEY) || "{}")[type]) || {}; } catch(e){}
  cols.forEach(function(c, ci){
    var h = mniNorm(c);
    if(mem[h] !== undefined){
      var f = mem[h];
      if(f){ for(var k in map) if(map[k] === f && +k !== ci) delete map[k]; map[ci] = f; }
      else delete map[ci];
    }
  });
  return map;
}
function mniRemember(type, ci, f){
  try {
    var all = JSON.parse(localStorage.getItem(MNI_MAPKEY) || "{}");
    all[type] = all[type] || {}; all[type][mniNorm(MNI.cols[ci])] = f || "";
    localStorage.setItem(MNI_MAPKEY, JSON.stringify(all));
  } catch(e){}
}

/* ============================================================
   ΣΧΕΔΙΟ ΕΙΣΑΓΩΓΗΣ — τι θα γίνει, πριν γίνει
   ============================================================ */
function mniMapped(){ var m = {}; for(var ci in MNI.map) if(MNI.map[ci]) m[MNI.map[ci]] = +ci; return m; }
function mniPlan(){
  var type = MNI.type, R = MNI_RECIPES[type], M = mniMapped();
  var P = { total:MNI.rows.length, recs:[], noName:0, inactive:0, dups:0, badVat:0, badMail:0,
            noVat:0, sameVat:0, kindSkipped:0, groups:0, grpMode:"",
            upd:0, add:0, hasName:M.name !== undefined, hasStatus:M.status !== undefined };
  if(!P.hasName) return P;
  var seen = {}, existing = {}, vatSeen = {};
  (DATA[R.coll] || []).forEach(function(r){ if(r.imp && r.ext) existing[r.ext] = 1; });
  MNI.rows.forEach(function(row){
    var o = {};
    R.fields.forEach(function(f){
      if(M[f.k] === undefined) return;
      var raw = row[M[f.k]];
      var v = f.t === "num" ? mniNum(raw)
            : f.t === "vat" ? mniVat(raw)
            : f.t === "tel" ? mniTel(raw)
            : f.t === "status" ? mniStatus(raw)
            : f.t === "zip" ? mniZip(raw)
            : f.t === "date" ? mniDate(raw)
            : mniStr(raw);
      if(v !== "" && v !== null) o[f.k] = v;
    });
    if(!o.name || /^(.)\1{5,}$/.test(o.name.replace(/\s/g, ""))){ P.noName++; return; }
    if(type === "products" && MNI.skipKinds && /εξοδ|υπηρεσ/.test(mniNorm((o.kind || "") + " " + (o.group || "")))){ P.kindSkipped++; return; }
    if(P.hasStatus && o.status === false){ P.inactive++; if(MNI.activeOnly) return; }
    if(M.vat !== undefined && mniNoVat(o.vat)){ P.noVat++; delete o.vat; }
    var dk = o.ext ? "e:" + o.ext : (o.vat && mniAfmOk(o.vat) && type !== "products") ? "v:" + o.vat : "n:" + mniNorm(o.name);
    if(seen[dk]){ P.dups++; return; }
    seen[dk] = 1;
    if(o.vat && /^\d{9}$/.test(o.vat) && !mniAfmOk(o.vat)) P.badVat++;
    if(o.vat && mniAfmOk(o.vat)){ if(vatSeen[o.vat]) P.sameVat++; vatSeen[o.vat] = 1; }
    if(o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) P.badMail++;
    if(MNI.mode === "merge" && o.ext && existing[o.ext]) P.upd++; else P.add++;
    P.recs.push(o);
  });
  if(type === "products") mniGroupItems(P, M);
  return P;
}

/* ---------- είδη: ανάλυση περιγραφής και ομαδοποίηση σε προϊόντα ----------
   Στο πρόγραμμα του πελάτη ο κωδικός είναι «021.0.002»: το «021» είναι το
   υλικό (ΔΕΜΑΤΙΟΥ), το υπόλοιπο η μορφή. Η περιγραφή κουβαλάει πάχος και
   μονάδα: «ΔΕΜΑΤΙΟΥ 0,02 ΣΕ Μ2». Η στήλη «Ομάδα» εκεί λέει Προϊόν/Εμπόρευμα
   — δεν είναι υλικό, γι' αυτό η ομαδοποίηση γίνεται από τον κωδικό. */
function mniGrpKey(code){
  var sg = String(code || "").split(".");
  if(sg.length < 2) return "";
  return sg[0].length >= 3 ? sg[0] : sg.slice(0, 2).join(".");
}
function mniParseDesc(d){
  var u = String(d || "").toUpperCase().replace(/M/g, "Μ"), r = {};
  if(/ΣΕ\s*Μ2|\bΜ2\b|Μ²/.test(u)) r.unit = "m²";
  else if(/ΣΕ\s*Μ\.?\s?Μ\.?(\s|$)|ΤΡΕΧ/.test(u)) r.unit = "μ.μ.";
  else if(/ΣΕ\s*Μ3|\bΜ3\b/.test(u)) r.unit = "m³";
  else if(/ΤΟΝΝ/.test(u)) r.unit = "τόνοι";
  else if(/ΤΕΜ/.test(u)) r.unit = "τεμ.";
  else if(/ΦΟΡΤΙΟ/.test(u)) r.unit = "φορτίο";
  else if(/ΠΑΛΕΤ/.test(u)) r.unit = "παλέτα";
  else if(/\bKG\b|ΚΙΛ|ΣΕ ΚG/.test(u)) r.unit = "kg";
  var t = u.match(/(\d+[.,]\d+)\s*(CΜ|ΕΚ)?/);
  if(t){
    var n = Number(t[1].replace(",", "."));
    if(t[2]) r.th = n; else if(n > 0 && n < 0.2) r.th = Math.round(n * 1000) / 10;
    if(/&\s*ΑΝΩ/.test(u) && r.th) r.thUp = true;
  }
  r.material = String(d || "").replace(/\s+ΣΕ\s+.*$/i, "").replace(/[\s.]+\d+[.,]\d+.*$/, "")
    .replace(/\s*&\s*ΑΝΩ.*$/i, "").replace(/\s+/g, " ").trim();
  return r;
}
var MNI_FORM = {"m³":"Όγκος", "τόνοι":"Χύμα (τόνοι)", "τεμ.":"Τεμάχιο", "φορτίο":"Φορτίο",
                "παλέτα":"Παλέτα", "μ.μ.":"Τρέχον μέτρο", "kg":"Κιλά"};
function mniGroupItems(P, M){
  var withDot = P.recs.filter(function(o){ return /\d\.\d/.test(o.ext || ""); }).length;
  var mode = MNI.grp === "auto"
    ? (P.recs.length && withDot / P.recs.length >= 0.5 ? "code" : (M.group !== undefined ? "column" : "none"))
    : MNI.grp;
  P.grpMode = mode;
  var names = {};
  P.recs.forEach(function(o, i){
    var pd = mniParseDesc(o.name);
    if(o.unit === undefined && pd.unit) o.unit = pd.unit;
    if(o.th === undefined && pd.th != null) o.th = pd.th;
    if(pd.thUp) o.thUp = true;
    if(o.form === undefined){
      var un = mniUnit(o.unit);
      o.form = un === "m²" ? (o.th ? "Πλάκα " + String(o.th).replace(".", ",") + (o.thUp ? "+" : "") + " cm" : "Πλάκα")
             : un === "μ.μ." && o.th ? "Τρέχον μέτρο · " + String(o.th).replace(".", ",") + (o.thUp ? "+" : "") + " cm"
             : (MNI_FORM[un] || "Είδος αποθήκης");
    }
    var g = mode === "code" ? mniGrpKey(o.ext) : mode === "column" ? (o.group || "") : "";
    o._g = g ? g : ("#" + (o.ext || i));
    var nm = mode === "column" ? (o.group || o.name) : (g ? (pd.material || o.name) : o.name);
    names[o._g] = names[o._g] || {};
    names[o._g][nm] = (names[o._g][nm] || 0) + 1;
  });
  var best = {};
  Object.keys(names).forEach(function(g){
    best[g] = Object.keys(names[g]).sort(function(a, b){ return names[g][b] - names[g][a] || a.length - b.length; })[0];
  });
  P.recs.forEach(function(o){ o._pn = best[o._g]; });
  P.groups = Object.keys(names).length;
}


/* ---------- αντικατάσταση δοκιμαστικών: κανόνες εξαρτήσεων ---------- */
var MNI_RULES = {
  customers:{ drop:[["orders","cust"],["quotes","cust"],["invoices","party"],["cutSheets","cust"]],
              unset:[["quotes","partner"],["customers","referrer"]],
              pull:[["priceLists","cust"]],
              orderLinks:[["workOrders","ord"],["slabs","ord"],["invoices","ord"],["cutSheets","ord"],["quotes","ord"]] },
  suppliers:{ drop:[["purchases","sup"],["supCatalog","sup"],["invoices","party"]],
              unset:[["items","sup"],["priceLists","sup"],["products","supplier"],["products","compliance.lab"]],
              pullObj:[["products","sup","id"]] }
};
function mniGet(o, p){ return p.split(".").reduce(function(a, k){ return a == null ? undefined : a[k]; }, o); }
function mniSet(o, p, v){ var ks = p.split("."), last = ks.pop(); var t = ks.reduce(function(a, k){ return a[k]; }, o); if(t) t[last] = v; }
function mniSeedKeys(coll){
  var s = {}; (SEED[coll] || []).forEach(function(r){ s[mniKey(r)] = 1; }); return s;
}
/* Υπολογίζει (και προαιρετικά εκτελεί) την αφαίρεση των δοκιμαστικών */
function mniReplace(type, run){
  var R = MNI_RECIPES[type], rules = MNI_RULES[type], out = { demo:0, drop:{}, unlinked:0, journal:[], tombs:[] };
  if(!rules) return out;
  var seedMain = mniSeedKeys(R.coll);
  var demoIds = (DATA[R.coll] || []).filter(function(r){ return !r.imp && seedMain[mniKey(r)]; }).map(mniKey);
  out.demo = demoIds.length;
  if(!demoIds.length) return out;
  var isDemo = {}; demoIds.forEach(function(i){ isDemo[i] = 1; });
  var droppedOrders = {};
  function unset(coll, field, test){
    (DATA[coll] || []).forEach(function(r){
      var v = mniGet(r, field);
      if(v && test(v)){
        out.unlinked++;
        if(run){ out.journal.push({op:"set", c:coll, k:mniKey(r), p:field, v:v}); mniSet(r, field, ""); }
      }
    });
  }
  rules.drop.forEach(function(d){
    var coll = d[0], field = d[1], seedK = mniSeedKeys(coll);
    var keep = [];
    (DATA[coll] || []).forEach(function(r){
      var ref = mniGet(r, field);
      if(ref && isDemo[ref]){
        if(seedK[mniKey(r)]){
          out.drop[coll] = (out.drop[coll] || 0) + 1;
          if(coll === "orders") droppedOrders[mniKey(r)] = 1;
          if(run){ out.tombs.push([coll, mniKey(r)]); return; }
        } else {
          /* εγγραφή του χρήστη: δεν σβήνεται, μόνο αποσυνδέεται */
          out.unlinked++;
          if(run){ out.journal.push({op:"set", c:coll, k:mniKey(r), p:field, v:ref}); mniSet(r, field, ""); }
        }
      }
      keep.push(r);
    });
    if(run) DATA[coll] = keep;
  });
  (rules.unset || []).forEach(function(u){ unset(u[0], u[1], function(v){ return isDemo[v]; }); });
  (rules.orderLinks || []).forEach(function(u){ unset(u[0], u[1], function(v){ return droppedOrders[v]; }); });
  (rules.pull || []).forEach(function(u){
    (DATA[u[0]] || []).forEach(function(r){
      var a = r[u[1]];
      if(Array.isArray(a) && a.some(function(x){ return isDemo[x]; })){
        out.unlinked++;
        if(run){ out.journal.push({op:"set", c:u[0], k:mniKey(r), p:u[1], v:a.slice()});
                 r[u[1]] = a.filter(function(x){ return !isDemo[x]; }); }
      }
    });
  });
  (rules.pullObj || []).forEach(function(u){
    (DATA[u[0]] || []).forEach(function(r){
      var a = r[u[1]];
      if(Array.isArray(a) && a.some(function(x){ return x && isDemo[x[u[2]]]; })){
        out.unlinked++;
        if(run){ out.journal.push({op:"set", c:u[0], k:mniKey(r), p:u[1], v:JSON.parse(JSON.stringify(a))});
                 r[u[1]] = a.filter(function(x){ return !(x && isDemo[x[u[2]]]); }); }
      }
    });
  });
  if(run){
    demoIds.forEach(function(i){ out.tombs.push([R.coll, i]); });
    DATA[R.coll] = DATA[R.coll].filter(function(r){ return !isDemo[mniKey(r)]; });
    out.tombs.forEach(function(t){ mnTomb(t[0], t[1]); });
  }
  return out;
}

/* ---------- κατασκευή εγγραφών ---------- */
function mniUniqueId(coll, base){
  var id = base, n = 2, have = {};
  (DATA[coll] || []).forEach(function(r){ have[mniKey(r)] = 1; });
  while(have[id]) id = base + "-" + (n++);
  return id;
}
function mniPartyRecord(type, o, file, batch){
  var R = MNI_RECIPES[type], r = Object.create(MNI_PROTO[type]);
  r.id = mniUniqueId(R.coll, R.prefix + (o.ext ? String(o.ext).replace(/\s+/g, "") : mniSlug(o.name)));
  r.imp = batch;
  MNI_PARTY_KEYS.forEach(function(k){ if(o[k] !== undefined) r[k] = o[k]; });
  if(type === "suppliers" && o.first) r.since = o.first;
  if(o.mob) r.wa = o.mob;
  if(o.status === false) r.status = type === "customers" ? "Ανενεργός" : "Ανενεργός";
  if(o.contact) r.contacts = [{n:o.contact, r:"Επαφή", m:o.mob || o.tel || "", e:o.email || "", bd:"", note:"", dept:""}];
  return r;
}
var MNI_PARTY_KEYS = ["ext","name","brand","vat","doy","kad","cat","addr","zip","city","country","tel","mob","email","web",
                      "payTerms","balance","credit","notes","iban","owner","first"];
function mniMergeParty(r, o){
  MNI_PARTY_KEYS.forEach(function(k){ if(k !== "ext" && o[k] !== undefined) r[k] = o[k]; });
  if(o.status !== undefined && o.status !== null) r.status = o.status ? "Ενεργός" : "Ανενεργός";
}
function mniVariant(o, i){
  var v = { sku:String(o.ext || ("PX-" + (i + 1))).replace(/\s+/g, ""),
            form:o.form || "Είδος αποθήκης", th:o.th != null ? o.th : 0, fin:o.fin || "—",
            unit:mniUnit(o.unit) || "τεμ.", stock:o.stock != null ? o.stock : 0, loc:"—",
            base:o.price != null ? o.price : 0, name:o.name, imp:1 };
  if(o.kind) v.kind = o.kind;
  if(o.thUp) v.thUp = true;
  if(o.cost != null) v.cost = o.cost;
  if(o.barcode) v.barcode = o.barcode;
  if(o.dims) v.dims = o.dims;
  if(o.vatRate != null) v.vatRate = o.vatRate;
  if(o.status === false) v.inactive = true;
  return v;
}
function mniImportProducts(P, file, batch){
  var R = MNI_RECIPES.products;
  var skus = {}; allVariants().forEach(function(x){ skus[x.v.sku] = x; });
  var add = 0, upd = 0, prods = 0;
  P.recs.forEach(function(o, i){
    var v = mniVariant(o, i);
    var hit = skus[v.sku];
    if(hit && hit.v.imp){                      /* υπάρχει από προηγούμενη εισαγωγή */
      for(var k in v) hit.v[k] = v[k]; upd++; return;
    }
    if(hit) v.sku = v.sku + "-X";                /* σύγκρουση με δικό μας SKU */
    var single = o._g.charAt(0) === "#";
    var pcode = R.prefix + (single ? (o.ext ? v.sku : mniSlug(o.name) + "-" + (i + 1)) : mniSlug(o._g));
    var p = find(DATA.products, "code", pcode);
    if(!p){
      p = Object.create(MNI_PROTO.products);
      p.code = pcode; p.imp = batch;
      p.name = o._pn || o.name;
      if(P.grpMode === "column" && o.group) p.family = o.group;
      if(/^ΓΡΑΝ/i.test(p.name)) p.petro = "Γρανίτης";
      else if(/^ΜΑΡΜ/i.test(p.name)) p.petro = "Μάρμαρο";
      if(o.supplier) p.supplier = o.supplier;
      p.created = mniToday(); p.variants = [];
      p.notes = "Εισαγωγή από " + file + (single ? "" : " · ομάδα κωδικού " + o._g);
      DATA.products.push(p); prods++;
    }
    p.variants.push(v); skus[v.sku] = {p:p, v:v}; add++;
    if(p.variants.every(function(x){ return x.inactive; })) p.status = "Ανενεργό";
    else if(p.status === "Ανενεργό") p.status = "Ενεργό";
  });
  return {add:add, upd:upd, prods:prods};
}

/* ============================================================
   ΕΚΤΕΛΕΣΗ · ΑΠΟΘΗΚΕΥΣΗ ΜΕ ΕΛΕΓΧΟ · ΑΝΑΙΡΕΣΗ
   ============================================================ */
function mniSaveChecked(){
  var s = JSON.stringify(DATA);
  try {
    localStorage.setItem(STORE_KEY, s);
    if((localStorage.getItem(STORE_KEY) || "").length !== s.length) return {ok:false, size:s.length};
  } catch(e){ return {ok:false, size:s.length}; }
  saveState();      /* και οι παράμετροι κόστους, όπως πάντα */
  return {ok:true, size:s.length};
}
function mniRun(){
  var type = MNI.type, R = MNI_RECIPES[type];
  var P = mniPlan();
  if(!P.hasName){ toast("Αντιστοιχίστε πρώτα τη στήλη «" + R.fields.filter(function(f){return f.k==="name";})[0].l + "»."); return; }
  if(!P.recs.length){ toast("Δεν υπάρχει καμία εγγραφή για εισαγωγή."); return; }
  var replace = MNI.mode === "replace" && R.replace;
  if(replace){
    var imp = mniReplace(type, false);
    if(imp.demo && !MNI.noConfirm && !confirm("Θα αφαιρεθούν " + imp.demo + " δοκιμαστικοί " + R.many
        + " μαζί με τις δοκιμαστικές κινήσεις τους. Επανέρχονται με «Επαναφορά». Συνέχεια;")) return;
  }
  var snapshot = JSON.stringify(DATA);
  var at = new Date().toISOString(), res = {type:type, file:MNI.file, fmt:MNI.fmt, at:at,
             rows:P.total, add:0, upd:0, skipped:P.noName + P.dups + P.kindSkipped + (MNI.activeOnly ? P.inactive : 0),
             mode:replace ? "replace" : "merge"};
  DATA._imp = DATA._imp || {log:[], journal:{}};
  DATA._imp.batches = DATA._imp.batches || {};
  DATA._imp.seq = (DATA._imp.seq || 1) + 1;          /* 1 = εισαγωγές πριν τις παρτίδες */
  var batch = DATA._imp.seq;
  DATA._imp.batches[batch] = {file:MNI.file, at:at};
  var J = DATA._imp.journal[type] = DATA._imp.journal[type] || {sets:[], tombs:[]};

  if(type === "products"){
    var pr = mniImportProducts(P, MNI.file, batch);
    res.add = pr.add; res.upd = pr.upd; res.prods = pr.prods;
  } else {
    if(replace){
      DATA[R.coll] = DATA[R.coll].filter(function(r){ return !r.imp; });
      var rp = mniReplace(type, true);
      J.sets = J.sets.concat(rp.journal);
      J.tombs = J.tombs.concat(rp.tombs);
      res.removedDemo = rp.demo; res.dropped = rp.drop; res.unlinked = rp.unlinked;
    }
    var byExt = {};
    DATA[R.coll].forEach(function(r){ if(r.imp && r.ext) byExt[r.ext] = r; });
    P.recs.forEach(function(o){
      var hit = o.ext && byExt[o.ext];
      if(hit){ mniMergeParty(hit, o); res.upd++; }
      else { var r = mniPartyRecord(type, o, MNI.file, batch); DATA[R.coll].push(r); if(o.ext) byExt[o.ext] = r; res.add++; }
    });
  }
  DATA._imp.log.unshift(res);
  var sv = mniSaveChecked();
  if(!sv.ok){
    DATA = JSON.parse(snapshot); mniHydrateAll();
    MNI.result = {fail:true, size:sv.size, type:type};
    render(); return;
  }
  res.size = sv.size;
  MNI.result = res;
  MNI.cols = []; MNI.rows = []; MNI.map = {};   /* το αρχείο «καταναλώθηκε» — όχι δεύτερο πάτημα κατά λάθος */
  MNI.file = ""; MNI.fmt = ""; MNI.caption = "";
  CUST = null; SUP = null; PROD = null;
  render();
  toast("Μπήκαν " + res.add.toLocaleString("el-GR") + " · ενημερώθηκαν " + res.upd.toLocaleString("el-GR") + ".");
}
function mniRevert(type){
  var R = MNI_RECIPES[type];
  var n = (DATA[R.coll] || []).filter(function(r){ return r.imp; }).length;
  if(type === "products") n = allVariants().filter(function(x){ return x.v.imp; }).length;
  if(!confirm("Αφαίρεση " + n + " εισαγμένων (" + R.label.toLowerCase() + ") και επαναφορά των δοκιμαστικών;")) return;
  if(type === "products"){
    DATA.products = DATA.products.filter(function(p){ return !p.imp; });
    DATA.products.forEach(function(p){ p.variants = p.variants.filter(function(v){ return !v.imp; }); });
  } else {
    DATA[R.coll] = DATA[R.coll].filter(function(r){ return !r.imp; });
  }
  var J = DATA._imp && DATA._imp.journal && DATA._imp.journal[type];
  if(J){
    J.sets.slice().reverse().forEach(function(e){
      var rec = (DATA[e.c] || []).filter(function(r){ return mniKey(r) === e.k; })[0];
      if(rec) mniSet(rec, e.p, e.v);
    });
    J.tombs.forEach(function(t){ mniUntomb(t[0], t[1]); });
    delete DATA._imp.journal[type];
  }
  DATA._imp = DATA._imp || {log:[], journal:{}};
  DATA._imp.log.unshift({type:type, at:new Date().toISOString(), revert:true, removed:n});
  saveState();
  loadState();            /* το backfill ξαναφέρνει τα δοκιμαστικά */
  MNI.result = null; CUST = null; SUP = null; PROD = null;
  render();
  toast("Επανήλθαν τα δοκιμαστικά — " + n + " εισαγμένες εγγραφές αφαιρέθηκαν.");
}

/* ============================================================
   ΠΡΑΓΜΑΤΙΚΑ ΔΕΔΟΜΕΝΑ ΤΗΣ ΕΤΑΙΡΕΙΑΣ — ένα κουμπί, ένας κωδικός  (Φ28δ)
   ------------------------------------------------------------
   Για να κάνουν τη δοκιμή ο Λάμπρος και η γραμματεία χωρίς να
   χειριστούν αρχεία. Τα αρχεία της εταιρείας βρίσκονται στο site
   ΚΡΥΠΤΟΓΡΑΦΗΜΕΝΑ (data/nikou-data.enc). Με τον σωστό κωδικό
   ανοίγουν μέσα στον browser και περνούν από την ίδια μηχανή
   εισαγωγής. Λάθος κωδικός = τίποτα δεν αλλάζει.
   ============================================================ */
var MNI_REAL_URL = "data/nikou-data.enc";
var MNI_REAL = {busy:false, msg:"", err:"", step:""};
function mniB64(s){ var b = atob(s), u = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function mniRealDecrypt(pw){
  var res;
  try { res = await fetch(MNI_REAL_URL, {cache:"no-store"}); } catch(e){ res = null; }
  if(!res || !res.ok) throw mniErr("Δεν βρέθηκε το αρχείο δεδομένων στο site. Ανοίξτε την εφαρμογή από τη διεύθυνση του GitHub Pages.");
  var pkg = await res.json();
  if(!window.crypto || !crypto.subtle) throw mniErr("Ο browser δεν υποστηρίζει αποκρυπτογράφηση. Ανοίξτε το site με https σε Chrome, Edge ή Firefox.");
  var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  var key = await crypto.subtle.deriveKey({name:"PBKDF2", salt:mniB64(pkg.salt), iterations:pkg.iter, hash:"SHA-256"},
                                          base, {name:"AES-GCM", length:256}, false, ["decrypt"]);
  var plain;
  try { plain = await crypto.subtle.decrypt({name:"AES-GCM", iv:mniB64(pkg.iv)}, key, mniB64(pkg.ct)); }
  catch(e){ throw mniErr("Λάθος κωδικός. Τίποτα δεν άλλαξε."); }
  var txt = await new Response(new Response(new Uint8Array(plain)).body.pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(txt);
}
async function mniRealLoad(){
  var el = document.getElementById("mniPw"), pw = el ? el.value : "";
  if(!pw){ MNI_REAL.err = "Γράψτε τον κωδικό."; render(); return; }
  MNI_REAL.busy = true; MNI_REAL.err = ""; MNI_REAL.msg = ""; MNI_REAL.step = "Άνοιγμα αρχείου…"; render();
  try {
    var data = await mniRealDecrypt(pw);
    var done = [];
    for(var i = 0; i < data.files.length; i++){
      var f = data.files[i], R = MNI_RECIPES[f.type];
      if(!R) continue;
      MNI_REAL.step = R.label + "…"; render();
      MNI.type = f.type; MNI.activeOnly = true; MNI.grp = "auto"; MNI.skipKinds = true;
      MNI.mode = R.replace ? "replace" : "merge";
      await mniLoadBytes(f.name, mniB64(f.b64));
      if(MNI.err) throw mniErr(f.name + ": " + MNI.err);
      MNI.noConfirm = true;
      try { mniRun(); } finally { MNI.noConfirm = false; }
      if(!MNI.result || MNI.result.fail) throw mniErr(f.name + ": δεν χώρεσε στον τοπικό χώρο του browser.");
      done.push(R.label + " " + (MNI.result.add + MNI.result.upd).toLocaleString("el-GR"));
    }
    DATA._imp.real = {at:new Date().toISOString(), packed:data.packed || ""};
    saveState();
    MNI.result = null;
    MNI_REAL.msg = "Φορτώθηκαν: " + done.join(" · ") + ". Οι δοκιμαστικοί πελάτες και προμηθευτές αντικαταστάθηκαν.";
    toast("Τα πραγματικά δεδομένα φορτώθηκαν.");
  } catch(e){
    MNI_REAL.err = e.mni ? e.message : "Η φόρτωση απέτυχε: " + e.message;
  } finally {
    MNI_REAL.busy = false; MNI_REAL.step = "";
    if(el) el.value = "";
    render();
  }
}
function mniRealBox(){
  var real = DATA._imp && DATA._imp.real;
  var h = '<div class="card" style="margin:14px 0 6px;padding:16px 18px;border-left:3px solid var(--ink)">'
    + '<div style="font-weight:700;font-size:15px;margin-bottom:6px">Πραγματικά δεδομένα της εταιρείας</div>'
    + '<div style="font-size:13.5px;line-height:1.6;color:var(--muted);margin-bottom:10px">'
    + (real
      ? 'Φορτώθηκαν σε αυτόν τον υπολογιστή στις ' + esc(String(real.at).slice(0, 16).replace("T", " "))
        + '. Πατήστε ξανά για νεότερη έκδοση· για επιστροφή στα δοκιμαστικά, «Επαναφορά» στο ιστορικό πιο κάτω.'
      : 'Πελάτες, προμηθευτές και είδη από το εμπορικό πρόγραμμα, έτοιμα για τη δοκιμή. '
        + 'Γράψτε τον κωδικό που σας δόθηκε — η φόρτωση παίρνει λίγα δευτερόλεπτα.')
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + '<input class="f" id="mniPw" type="password" autocomplete="off" placeholder="Κωδικός" style="max-width:220px"'
    + (MNI_REAL.busy ? ' disabled' : '') + ' onkeydown="if(event.key===\'Enter\')mniRealLoad()">'
    + '<button class="b" onclick="mniRealLoad()"' + (MNI_REAL.busy ? ' disabled' : '') + '>'
    + (MNI_REAL.busy ? esc(MNI_REAL.step || "Φόρτωση…") : (real ? "Ξαναφόρτωση" : "Φόρτωση πραγματικών δεδομένων")) + '</button></div>';
  if(MNI_REAL.err) h += '<div style="margin-top:10px;color:var(--bad,#b3261e);font-size:13.5px;font-weight:600">' + esc(MNI_REAL.err) + '</div>';
  if(MNI_REAL.msg) h += '<div style="margin-top:10px;color:var(--ok,#2e7d32);font-size:13.5px;font-weight:600">' + esc(MNI_REAL.msg) + '</div>';
  return h + '</div>';
}

/* ============================================================
   ΡΟΗ ΟΘΟΝΗΣ
   ============================================================ */
function mniGo(type){ MNI.type = type || MNI.type; goSec("admin", MNI_SEC); }
function mniPick(type){
  if(MNI.type !== type){ MNI.cols = []; MNI.rows = []; MNI.map = {}; MNI.file = ""; MNI.err = ""; }
  MNI.type = type; MNI.result = null;
  MNI.mode = "merge";
  render();
}
function mniClear(){ MNI.cols = []; MNI.rows = []; MNI.map = {}; MNI.file = ""; MNI.fmt = ""; MNI.err = ""; MNI.result = null; render(); }
function mniFile(input){
  var f = input.files && input.files[0]; if(!f) return;
  MNI.busy = true; MNI.err = ""; MNI.result = null; render();
  f.arrayBuffer().then(function(buf){ return mniLoadBytes(f.name, new Uint8Array(buf)); })
   .catch(function(e){ MNI.err = e.mni ? e.message : "Το αρχείο δεν διαβάστηκε: " + e.message; MNI.busy = false; render(); });
}
function mniLoadBytes(name, bytes){
  MNI.busy = true; MNI.err = "";
  var rd = MNI_READERS.filter(function(r){ return r.test(name, bytes); })[0];
  return Promise.resolve().then(function(){ return rd.read(bytes, name); }).then(function(tb){
    /* το λάθος που βρήκαμε στα αρχεία της 09/09: μόνο κωδικός + «Message» */
    var real = tb.cols.filter(function(c){ var n = mniNorm(c); return ["id","message","key","keyfield","α α"].indexOf(n) < 0; });
    if(!real.length)
      throw mniErr("Το αρχείο έχει μόνο τον εσωτερικό κωδικό κάθε εγγραφής (" + tb.rows.length.toLocaleString("el-GR")
        + " εγγραφές, στήλες: " + tb.cols.join(", ") + ") — η εξαγωγή έγινε χωρίς στήλες. "
        + "Ζητήστε νέα εξαγωγή με τις στήλες ορατές (επωνυμία, ΑΦΜ, διεύθυνση, τηλέφωνα…).");
    if(!tb.rows.length) throw mniErr("Το αρχείο έχει επικεφαλίδες αλλά καμία εγγραφή.");
    MNI.cols = tb.cols; MNI.rows = tb.rows; MNI.file = name; MNI.fmt = rd.label; MNI.caption = tb.caption || "";
    if(!MNI.type) MNI.type = mniGuessType(tb);
    MNI.map = mniAutoMap(MNI.type, MNI.cols);
    MNI.busy = false; render();
  }).catch(function(e){
    MNI.err = e.mni ? e.message : "Το αρχείο δεν διαβάστηκε: " + e.message;
    MNI.cols = []; MNI.rows = []; MNI.busy = false; render();
  });
}
function mniGuessType(tb){
  var c = mniNorm(tb.caption + " " + tb.cols.join(" "));
  if(/προμηθευτ|supplier/.test(c)) return "suppliers";
  if(/ειδ|αποθηκ|material|περιγραφ|barcode/.test(c)) return "products";
  return "customers";
}
function mniSetMap(ci, f){
  for(var k in MNI.map) if(MNI.map[k] === f && f) delete MNI.map[k];
  if(f) MNI.map[ci] = f; else delete MNI.map[ci];
  mniRemember(MNI.type, ci, f);
  render();
}
function mniOpt(k, v){ MNI[k] = v; render(); }
function mniSetType(type){
  MNI.type = type; MNI.map = MNI.cols.length ? mniAutoMap(type, MNI.cols) : {};
  MNI.grp = "auto"; MNI.skipKinds = true;
  MNI.mode = "merge"; MNI.result = null; render();
}

/* ---------- η οθόνη ---------- */
function mniCounts(){
  return {
    customers:[DATA.customers.filter(function(r){return r.imp;}).length, DATA.customers.length],
    suppliers:[DATA.suppliers.filter(function(r){return r.imp;}).length, DATA.suppliers.length],
    products:[allVariants().filter(function(x){return x.v.imp;}).length, allVariants().length]
  };
}
function mniBox(kind, html){
  var c = kind === "bad" ? "var(--bad,#b3261e)" : kind === "ok" ? "var(--ok,#2e7d32)" : "var(--warn,#a86b00)";
  return '<div style="border:1px solid var(--line);border-left:3px solid ' + c
    + ';background:var(--raise);padding:12px 14px;margin:12px 0;font-size:13.5px;line-height:1.55">' + html + '</div>';
}
function mniH(t){ return '<div class="vein"></div><h2 class="sec">' + esc(t) + '</h2>'; }
function viewImport(){
  var C = mniCounts(), R = MNI.type ? MNI_RECIPES[MNI.type] : null;
  var h = '<h1>' + esc(MNI_SEC) + '</h1><p class="sub">Πελάτες, προμηθευτές και είδη από το πρόγραμμα που χρησιμοποιείτε σήμερα. '
    + 'Τα δεδομένα μένουν μόνο σε αυτόν τον υπολογιστή — δεν ανεβαίνουν πουθενά.</p>';
  h += '<div class="grid">'
    + kpi("Πελάτες", C.customers[1].toLocaleString("el-GR"), C.customers[0] ? C.customers[0].toLocaleString("el-GR") + " από εισαγωγή" : "μόνο δοκιμαστικοί")
    + kpi("Προμηθευτές", C.suppliers[1].toLocaleString("el-GR"), C.suppliers[0] ? C.suppliers[0].toLocaleString("el-GR") + " από εισαγωγή" : "μόνο δοκιμαστικοί")
    + kpi("Είδη (SKU)", C.products[1].toLocaleString("el-GR"), C.products[0] ? C.products[0].toLocaleString("el-GR") + " από εισαγωγή" : "μόνο δοκιμαστικά")
    + mniStorageKpi() + '</div>';
  h += mniRealBox();

  /* 1 — τι φέρνετε */
  h += mniH("1. Τι φέρνετε");
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px">';
  ["customers","suppliers","products"].forEach(function(t){
    h += '<button class="b' + (MNI.type === t ? '' : ' ghost') + '" onclick="mniSetType(\'' + t + '\')">'
      + esc(MNI_RECIPES[t].label) + '</button>';
  });
  h += '</div>';
  if(!MNI.type){
    return h + '<div class="tw"><div class="empty">Διαλέξτε τι θέλετε να φέρετε.</div></div>' + mniHistory();
  }
  h += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
    + '<button class="b" onclick="document.getElementById(\'mniFile\').click()">' + (MNI.file ? 'Άλλο αρχείο…' : 'Επιλογή αρχείου…') + '</button>'
    + '<input id="mniFile" type="file" accept=".xlsx,.xls,.csv,.txt,.tsv,.json,.xml" style="display:none" onchange="mniFile(this)">'
    + (MNI.file ? '<span><strong>' + esc(MNI.file) + '</strong> · ' + esc(MNI.fmt)
        + (MNI.caption ? ' · «' + esc(MNI.caption) + '»' : '')
        + ' · ' + MNI.rows.length.toLocaleString("el-GR") + ' γραμμές</span>' : '')
    + '</div>';
  h += '<p class="sub" style="margin-top:8px">Μορφές που διαβάζονται: '
    + MNI_READERS.map(function(r){ return esc(r.label); }).join(", ")
    + '. Αν το πρόγραμμα βγάζει κάτι άλλο, στείλτε μας ένα μικρό δείγμα — προστίθεται χωρίς να αλλάξει τίποτα άλλο στην εφαρμογή.</p>';
  if(MNI.busy) h += mniBox("warn", "Διαβάζεται το αρχείο…");
  if(MNI.err) h += mniBox("bad", "<strong>Το αρχείο δεν μπορεί να μπει.</strong><br>" + esc(MNI.err));
  if(MNI.result) h += mniResultBox();
  if(!MNI.cols.length) return h + mniHistory();

  /* 2 — αντιστοίχιση */
  h += mniH("2. Ποια στήλη είναι τι");
  var used = mniMapped();
  h += '<div class="tw"><table><thead><tr><th>Στήλη αρχείου</th><th>Δείγμα</th><th style="width:300px">Πεδίο στην εφαρμογή</th></tr></thead><tbody>';
  MNI.cols.forEach(function(c, ci){
    var smp = [];
    var fdef = R.fields.filter(function(f){ return f.k === MNI.map[ci]; })[0];
    for(var i = 0; i < MNI.rows.length && smp.length < 3; i++){
      var v = mniStr(MNI.rows[i][ci]);
      if(v && fdef && fdef.t === "date") v = mniDate(v) || v;   /* 44558 → 2021-12-28 */
      if(v) smp.push(v);
    }
    var opts = '<option value="">— να μη μπει —</option>' + R.fields.map(function(f){
      var taken = used[f.k] !== undefined && used[f.k] !== ci;
      return '<option value="' + f.k + '"' + (MNI.map[ci] === f.k ? ' selected' : '') + '>'
        + esc(f.l) + (f.req ? ' *' : '') + (taken ? ' (ήδη σε άλλη στήλη)' : '') + '</option>';
    }).join("");
    h += '<tr' + (MNI.map[ci] ? '' : ' style="opacity:.6"') + '><td><strong>' + esc(c) + '</strong></td>'
      + '<td style="font-size:12.5px;color:var(--muted)">' + (smp.length ? esc(smp.join(" · ")).slice(0, 120) : "—") + '</td>'
      + '<td><select class="f" onchange="mniSetMap(' + ci + ',this.value)">' + opts + '</select></td></tr>';
  });
  h += '</tbody></table></div>';

  /* 3 — έλεγχος */
  var P = mniPlan();
  h += mniH("3. Τι θα μπει");
  if(!P.hasName){
    return h + mniBox("bad", "Αντιστοιχίστε τη στήλη που έχει την <strong>"
      + esc(R.fields.filter(function(f){ return f.req; })[0].l) + "</strong>. Χωρίς αυτή δεν γίνεται εισαγωγή.") + mniHistory();
  }
  var fmt = function(n){ return n.toLocaleString("el-GR"); };
  var skipped = P.noName + P.dups + P.kindSkipped + (MNI.activeOnly ? P.inactive : 0);
  h += '<div class="grid">'
    + kpi("Γραμμές αρχείου", fmt(P.total), "")
    + kpi(MNI.type === "products" ? "Θα μπουν (SKU)" : "Θα μπουν", fmt(P.recs.length),
          P.upd ? fmt(P.add) + " νέες · " + fmt(P.upd) + " ενημερώσεις" : "όλες νέες")
    + (MNI.type === "products" ? kpi("Προϊόντα", fmt(P.groups),
          P.grpMode === "code" ? "ομάδες από τον κωδικό" : P.grpMode === "column" ? "από τη στήλη ομάδας" : "ένα ανά είδος") : "")
    + kpi("Παραλείπονται", fmt(skipped),
          [P.noName + " χωρίς όνομα", P.dups + " διπλές"]
            .concat(P.kindSkipped ? [P.kindSkipped + " έξοδα/υπηρεσίες"] : [])
            .concat(P.hasStatus ? [P.inactive + " ανενεργές"] : []).join(" · "),
          (P.noName + P.dups) > 0)
    + (MNI.type !== "products" ? kpi("Προς έλεγχο", P.badVat + P.badMail,
          P.badVat + " ΑΦΜ · " + P.badMail + " email — μπαίνουν όπως είναι", (P.badVat + P.badMail) > 0) : "")
    + (MNI.type !== "products" && P.noVat ? kpi("Χωρίς ΑΦΜ", fmt(P.noVat),
          "κενό, μηδενικά ή σύντομος αριθμός — μπαίνουν χωρίς ΑΦΜ") : "")
    + '</div>';
  if(P.sameVat) h += '<p class="sub">' + fmt(P.sameVat) + ' εγγραφές έχουν ΑΦΜ που υπάρχει ήδη σε άλλον κωδικό. Μπαίνουν χωριστά — '
    + 'είναι πιθανόν η ίδια εταιρεία δύο φορές στο πρόγραμμά σας.</p>';
  if(P.hasStatus){
    h += '<label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px">'
      + '<input type="checkbox"' + (MNI.activeOnly ? ' checked' : '') + ' onchange="mniOpt(\'activeOnly\',this.checked)"> '
      + 'Μόνο ενεργοί (' + (P.inactive).toLocaleString("el-GR") + ' ανενεργές μένουν έξω)</label>';
    if(P.total > 50 && P.inactive / P.total < 0.02)
      h += mniBox("warn", "Σχεδόν όλες οι εγγραφές είναι «Ενεργός: Ναι» (" + fmt(P.inactive) + " ανενεργές σε " + fmt(P.total)
        + "). Η στήλη δεν ξεχωρίζει όσους δουλεύετε σήμερα. Για να μπουν μόνο αυτοί, χρειάζεται εξαγωγή με στήλη "
        + "«Τελευταία κίνηση» ή «Τζίρος».");
  } else {
    h += '<p class="sub">Δεν υπάρχει στήλη «ενεργός/ανενεργός» — θα μπουν όλες οι εγγραφές.</p>';
  }
  /* προεπισκόπηση */
  var Mm = mniMapped();
  var cols = MNI.type === "products"
    ? [["ext","Κωδικός"],["name","Περιγραφή"],["_pn","→ Προϊόν"],["form","Μορφή"],["unit","Μον."]]
        .concat(Mm.price !== undefined ? [["price","Τιμή"]] : []).concat(Mm.stock !== undefined ? [["stock","Απόθεμα"]] : [])
        .concat(Mm.kind !== undefined ? [["kind","Χαρακτηρισμός"]] : [])
    : [["ext","Κωδικός"],["name","Επωνυμία"],["vat","ΑΦΜ"]]
        .concat(Mm.city !== undefined ? [["city","Πόλη"]] : Mm.addr !== undefined ? [["addr","Διεύθυνση"]] : [])
        .concat([["tel","Τηλέφωνο"]])
        .concat(Mm.email !== undefined ? [["email","Email"]] : Mm.owner !== undefined ? [["owner","Πωλητής"]] : []);
  h += '<div class="tw" style="margin-top:10px"><table><thead><tr>'
    + cols.map(function(c){ return '<th>' + esc(c[1]) + '</th>'; }).join("") + '</tr></thead><tbody>';
  P.recs.slice(0, 12).forEach(function(o){
    h += '<tr>' + cols.map(function(c){
      var v = o[c[0]];
      if(c[0] === "vat" && v && /^\d+$/.test(v) && !mniAfmOk(v)) return '<td>' + esc(v) + ' <span class="pill bad">έλεγχος</span></td>';
      if(c[0] === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return '<td>' + esc(v) + ' <span class="pill bad">έλεγχος</span></td>';
      return '<td>' + (v == null || v === "" ? '<span style="color:var(--faint)">—</span>' : esc(typeof v === "number" ? num(v, 2) : v)) + '</td>';
    }).join("") + '</tr>';
  });
  h += '</tbody></table></div>';
  if(P.recs.length > 12) h += '<p class="sub">Εμφανίζονται οι 12 πρώτες από ' + P.recs.length.toLocaleString("el-GR") + '.</p>';

  /* τρόπος */
  h += mniH("4. Πώς μπαίνουν");
  h += '<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:14px"><input type="radio" name="mniMode"'
    + (MNI.mode === "merge" ? ' checked' : '') + ' onchange="mniOpt(\'mode\',\'merge\')"> <span><strong>Προσθήκη και ενημέρωση.</strong> '
    + 'Τα δοκιμαστικά μένουν. Αν ένας κωδικός έχει ξαναμπεί, ενημερώνεται αντί να διπλασιαστεί.</span></label>';
  if(R.replace){
    var imp = mniReplace(MNI.type, false);
    var dl = []; for(var k in imp.drop) dl.push(imp.drop[k] + " " + MNI_COLL_LABEL[k]);
    h += '<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:14px"><input type="radio" name="mniMode"'
      + (MNI.mode === "replace" ? ' checked' : '') + ' onchange="mniOpt(\'mode\',\'replace\')"> <span><strong>Αντικατάσταση των δοκιμαστικών.</strong> '
      + 'Φεύγουν οι ' + imp.demo + ' ψεύτικοι ' + esc(R.many)
      + (dl.length ? ' και οι κινήσεις τους: ' + esc(dl.join(", ")) : '') + '.'
      + (imp.unlinked ? ' ' + imp.unlinked + ' εγγραφές μένουν αλλά χάνουν τη σύνδεση (π.χ. εντολές παραγωγής χωρίς παραγγελία).' : '')
      + ' Όλα επανέρχονται με «Επαναφορά».</span></label>';
  } else {
    var gl = {auto:"Αυτόματα (προτείνεται)", code:"Από τον κωδικό (021.0.002 → υλικό 021)", column:"Από τη στήλη «Ομάδα»", none:"Κάθε είδος χωριστό προϊόν"};
    h += '<div class="frow" style="margin:6px 0 10px"><div><label class="f">Ομαδοποίηση σε προϊόντα</label>'
      + '<select class="f" onchange="mniOpt(\'grp\',this.value)">'
      + Object.keys(gl).map(function(k){ return '<option value="' + k + '"' + (MNI.grp === k ? ' selected' : '') + '>' + esc(gl[k]) + '</option>'; }).join("")
      + '</select></div></div>';
    h += '<p class="sub">Τώρα: <strong>' + esc(P.grpMode === "code" ? "από τον κωδικό" : P.grpMode === "column" ? "από τη στήλη «Ομάδα»" : "κάθε είδος χωριστά")
      + '</strong> → ' + fmt(P.groups) + ' προϊόντα. Πάχος, μονάδα και μορφή διαβάζονται από την περιγραφή όταν δεν υπάρχουν στήλες.</p>';
    h += '<label style="display:flex;gap:8px;align-items:center;margin:6px 0 10px;font-size:14px">'
      + '<input type="checkbox"' + (MNI.skipKinds ? ' checked' : '') + ' onchange="mniOpt(\'skipKinds\',this.checked)"> '
      + 'Χωρίς λογιστικά έξοδα και υπηρεσίες' + (P.kindSkipped ? ' (' + fmt(P.kindSkipped) + ' μένουν έξω)' : '') + '</label>';
    h += '<p class="sub">Η αντικατάσταση των δοκιμαστικών προϊόντων δεν είναι διαθέσιμη ακόμα: τα 12 προϊόντα μας συνδέονται με δελτία, '
      + 'προσφορές, παραγγελίες, πλάκες και τιμοκαταλόγους. Θα οριστεί όταν δούμε πώς οργανώνει τα είδη το πρόγραμμά σας.</p>';
  }
  h += '<div style="margin:16px 0 6px;display:flex;gap:8px;flex-wrap:wrap">'
    + '<button class="b" onclick="mniRun()">Εισαγωγή ' + P.recs.length.toLocaleString("el-GR") + ' εγγραφών</button>'
    + '<button class="b ghost" onclick="mniClear()">Ακύρωση</button></div>';
  return h + mniHistory();
}
var MNI_COLL_LABEL = { orders:"παραγγελίες", quotes:"προσφορές", invoices:"παραστατικά", cutSheets:"δελτία",
                       purchases:"αγορές", supCatalog:"είδη καταλόγου προμηθευτή" };
function mniStorageKpi(){
  var n = 0; try { n = JSON.stringify(DATA).length; } catch(e){}
  var mb = n / 1048576, pct = Math.round(mb / 5 * 100);
  return kpi("Τοπικός χώρος", mb.toLocaleString("el-GR", {maximumFractionDigits:2}) + " MB",
             "περίπου " + pct + "% από ~5 MB", pct > 80);
}
function mniResultBox(){
  var r = MNI.result, R = MNI_RECIPES[r.type];
  if(r.fail){
    return mniBox("bad", "<strong>Δεν χώρεσε — τίποτα δεν άλλαξε.</strong> Τα δεδομένα θα έπιαναν "
      + (r.size / 1048576).toLocaleString("el-GR", {maximumFractionDigits:1})
      + " MB, πάνω από τον τοπικό χώρο του browser (~5 MB). Κρατήστε «μόνο ενεργοί», αφαιρέστε φωτογραφίες, "
      + "ή φέρτε λιγότερες στήλες.");
  }
  var t = "<strong>Έγινε.</strong> " + r.add.toLocaleString("el-GR") + " νέες, " + r.upd.toLocaleString("el-GR") + " ενημερώσεις"
    + (r.skipped ? ", " + r.skipped.toLocaleString("el-GR") + " παραλείφθηκαν" : "") + ".";
  if(r.removedDemo) t += " Αφαιρέθηκαν " + r.removedDemo + " δοκιμαστικοί " + esc(R.many) + ".";
  if(r.prods) t += " Δημιουργήθηκαν " + r.prods + " προϊόντα.";
  return mniBox("ok", t + ' <button class="b ghost" style="margin-left:8px" onclick="MNI_RECIPES[\'' + r.type + '\'].open()">Άνοιγμα: '
    + esc(R.label) + '</button>');
}
function mniHistory(){
  var L = (DATA._imp && DATA._imp.log) || [];
  var C = mniCounts();
  var h = mniH("Ιστορικό εισαγωγών");
  if(!L.length) return h + '<div class="tw"><div class="empty">Δεν έχει γίνει καμία εισαγωγή σε αυτόν τον υπολογιστή.</div></div>';
  h += '<div class="tw"><table><thead><tr><th>Πότε</th><th>Τι</th><th>Αρχείο</th><th class="rt">Νέες</th><th class="rt">Ενημ.</th><th>Τρόπος</th></tr></thead><tbody>';
  L.slice(0, 20).forEach(function(r){
    var R = MNI_RECIPES[r.type] || {label:r.type};
    h += '<tr><td class="mono">' + esc(String(r.at).slice(0, 16).replace("T", " ")) + '</td><td>' + esc(R.label) + '</td>'
      + (r.revert
          ? '<td colspan="3">Επαναφορά — αφαιρέθηκαν ' + r.removed + '</td><td>—</td>'
          : '<td>' + esc(r.file) + ' <span style="color:var(--muted);font-size:12px">' + esc(r.fmt) + '</span></td>'
            + '<td class="rt mono">' + r.add + '</td><td class="rt mono">' + r.upd + '</td>'
            + '<td>' + (r.mode === "replace" ? '<span class="pill warn">αντικατάσταση</span>' : 'προσθήκη') + '</td>')
      + '</tr>';
  });
  h += '</tbody></table></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">';
  ["customers","suppliers","products"].forEach(function(t){
    var J = DATA._imp.journal && DATA._imp.journal[t];
    if(C[t][0] || (J && (J.sets.length || J.tombs.length)))
      h += '<button class="b ghost" onclick="mniRevert(\'' + t + '\')">Επαναφορά: ' + esc(MNI_RECIPES[t].label) + '</button>';
  });
  return h + '</div>';
}

/* ---------- σύνδεση με την υπόλοιπη εφαρμογή ---------- */
(function(){
  var adm = find(ROLES, "id", "admin");
  var g = adm && adm.groups.filter(function(x){ return x.g === "Ρυθμίσεις"; })[0];
  if(g && g.items.indexOf(MNI_SEC) < 0) g.items.splice(1, 0, MNI_SEC);
})();
var _mniRender = render;
render = function(){
  if(ROLE === "admin" && SEC === MNI_SEC){
    renderRoles(); renderSide();
    document.getElementById("view").innerHTML = viewImport();
    return;
  }
  _mniRender();
};
/* κουμπί εισαγωγής δίπλα στο «+ Νέος …» των τριών λιστών */
(function(){
  function hook(fnName, anchor, type, label){
    var orig = window[fnName];
    if(typeof orig !== "function") return;
    window[fnName] = function(){
      var h = orig.apply(this, arguments);
      if(typeof h === "string" && h.indexOf(anchor) >= 0)
        h = h.replace(anchor, anchor + ' <button class="b ghost" onclick="mniGo(\'' + type + '\')">' + label + '</button>');
      return h;
    };
  }
  hook("viewCustomers", '<button class="b" onclick="openNewCustomer()">+ Νέος πελάτης</button>', "customers", "Εισαγωγή πελατολογίου");
  hook("viewSuppliers", '<button class="b" onclick="openNewSupplier()">+ Νέος προμηθευτής</button>', "suppliers", "Εισαγωγή προμηθευτών");
  hook("viewProducts",  '<button class="b" onclick="openNewProduct()">+ Νέο προϊόν</button>', "products", "Εισαγωγή ειδών");
})();
/* ---------- μεγάλες λίστες: σελίδες των 150 ----------
   Με 4.373 πελάτες ο πίνακας ζωγραφίζει χιλιάδες γραμμές σε κάθε πλήκτρο.
   Η αναζήτηση και τα φίλτρα δουλεύουν σε ΟΛΕΣ τις εγγραφές· κόβεται μόνο η
   εμφάνιση, με κουμπί για τις επόμενες. */
var MNI_PAGE = 150, MNI_SHOW = {}, MNI_FULL = {};
var _mniRunTable = runTable;
runTable = function(t, rows, cfg){
  var out = _mniRunTable(t, rows, cfg);
  if(["cust","sup","prd"].indexOf(t) < 0 || out.length <= MNI_PAGE) { MNI_FULL[t] = null; return out; }
  MNI_FULL[t] = out.length;
  return out.slice(0, MNI_SHOW[t] || MNI_PAGE);
};
function mniMore(t){ MNI_SHOW[t] = (MNI_SHOW[t] || MNI_PAGE) + MNI_PAGE * 2; render(); }
function mniAll(t){ MNI_SHOW[t] = 1e9; render(); }
(function(){
  [["viewCustomers","cust"],["viewSuppliers","sup"],["viewProducts","prd"]].forEach(function(x){
    var orig = window[x[0]]; if(typeof orig !== "function") return;
    window[x[0]] = function(){
      var h = orig.apply(this, arguments), t = x[1], full = MNI_FULL[t];
      if(!full || typeof h !== "string") return h;
      var shown = Math.min(MNI_SHOW[t] || MNI_PAGE, full);
      /* ο μετρητής της εργαλειοθήκης δείχνει τις ΕΜΦΑΝΙΖΟΜΕΝΕΣ — του λέμε και το σύνολο */
      var bar = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0">'
        + '<span class="sub" style="margin:0">Εμφανίζονται ' + shown.toLocaleString("el-GR") + ' από '
        + full.toLocaleString("el-GR") + ' που ταιριάζουν. Η αναζήτηση ψάχνει σε όλες.</span>'
        + (shown < full ? '<button class="b ghost sm" onclick="mniMore(\'' + t + '\')">Περισσότερες</button>'
          + '<button class="b ghost sm" onclick="mniAll(\'' + t + '\')">Όλες (' + full.toLocaleString("el-GR") + ')</button>' : '')
        + '</div>';
      var i = h.lastIndexOf("</tbody></table></div>");
      return i < 0 ? h + bar : h.slice(0, i + 22) + bar + h.slice(i + 22);
    };
  });
})();
/* Το banner λέει «καμία πραγματική τιμή ή στοιχείο πελάτη». Μετά από εισαγωγή
   αυτό δεν ισχύει πια σε ΑΥΤΟΝ τον υπολογιστή — το λέμε καθαρά. */
var MNI_BANNER = null;
function mniBanner(){
  var b = document.querySelector(".banner"); if(!b) return;
  if(MNI_BANNER === null) MNI_BANNER = b.innerHTML;
  var real = DATA && ["customers","suppliers","products"].some(function(k){
    return (DATA[k] || []).some(function(r){ return r.imp; }); });
  var want = real
    ? '<strong>Mockup — Φάση 1.</strong> Περιέχει <strong>πραγματικά δεδομένα από εισαγωγή</strong>, αποθηκευμένα μόνο σε αυτόν τον υπολογιστή. '
      + 'Τα υπόλοιπα είναι δοκιμαστικά. <a href="#" onclick="mniGo();return false" style="color:inherit;font-weight:700;text-decoration:underline">Εισαγωγή δεδομένων</a>'
    : MNI_BANNER + ' <a href="#" onclick="mniGo();return false" style="color:inherit;font-weight:700;text-decoration:underline">Φόρτωση πραγματικών δεδομένων</a>';
  if(b.innerHTML !== want) b.innerHTML = want;
}
var _mniRender2 = render;
render = function(){ _mniRender2(); mniBanner(); };
/* ============================================================
   ΔΟΚΙΜΑΣΤΙΚΑ ΑΡΧΕΙΑ — για να ακολουθηθεί ο οδηγός χωρίς δικό σας αρχείο
   Φτιάχνονται μέσα στον browser, με ΓΝΩΣΤΑ νούμερα ώστε ο οδηγός να λέει
   ακριβώς τι πρέπει να δείτε. Τα ονόματα είναι ρητά «ΔΟΚΙΜΑΣΤΙΚΟΣ».
   ============================================================ */
function mniDemoAfm(i, bad){
  var d = String(10000000 + i * 7919 % 90000000).slice(-8).split("").map(Number), s = 0;
  for(var k = 0; k < 8; k++) s += d[k] * Math.pow(2, 8 - k);
  var c = (s % 11) % 10;
  return d.join("") + String(bad ? (c + 1) % 10 : c);
}
var MNI_DEMO = {
  /* 82 γραμμές → 3 χωρίς επωνυμία · 10 ανενεργές · 2 διπλές · μπαίνουν 67
     · προς έλεγχο: 2 ΑΦΜ + 3 email */
  customers:function(){
    var cities = ["Ιωάννινα","Άρτα","Πρέβεζα","Μέτσοβο","Κόνιτσα","Ηγουμενίτσα"], rows = [];
    rows.push("Κωδικός;Επωνυμία;ΑΦΜ;ΔΟΥ;Διεύθυνση;Πόλη;Τ.Κ.;Τηλέφωνο;Κινητό;Email;Ενεργός;Υπόλοιπο");
    var line = function(i){
      var n = String(i).padStart(3, "0");
      var name = [7, 23, 51].indexOf(i) >= 0 ? "" : "ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ " + n;
      var mail = [12, 44, 61].indexOf(i) >= 0 ? "pelatis" + n + "-xoris-papaki" : "pelatis" + n + "@example.gr";
      return ["ΔΟΚ-" + n, name, mniDemoAfm(i, i === 5 || i === 33), "Α΄ Ιωαννίνων", "Οδός Δοκιμής " + i,
              cities[i % cities.length], 45000 + i, "26510" + String(10000 + i), "69" + String(40000000 + i),
              mail, i % 8 === 0 ? "Όχι" : "Ναι", (i * 12.5).toFixed(2).replace(".", ",")].join(";");
    };
    for(var i = 1; i <= 80; i++) rows.push(line(i));
    rows.push(line(10)); rows.push(line(11));        /* δύο διπλές */
    return {name:"δοκιμαστικό-πελάτες.csv", text:rows.join("\r\n")};
  },
  /* 12 προμηθευτές, όλοι σωστοί */
  suppliers:function(){
    var rows = ["Κωδικός προμηθευτή;Επωνυμία;ΑΦΜ;Πόλη;Τηλέφωνο;Email;IBAN"];
    for(var i = 1; i <= 12; i++){
      var n = String(i).padStart(2, "0");
      rows.push(["ΠΡ-" + n, "ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΡΟΜΗΘΕΥΤΗΣ " + n, mniDemoAfm(500 + i), "Θεσσαλονίκη",
                 "2310" + String(100000 + i), "promitheftis" + n + "@example.gr",
                 "GR00 0000 0000 0000 0000 0000 0" + n].join(";"));
    }
    return {name:"δοκιμαστικό-προμηθευτές.csv", text:rows.join("\r\n")};
  },
  /* 60 είδη σε 3 ομάδες · 6 ανενεργά → μπαίνουν 54 SKU σε 3 προϊόντα */
  products:function(){
    var groups = ["ΔΟΚΙΜΑΣΤΙΚΟ ΛΕΥΚΟ","ΔΟΚΙΜΑΣΤΙΚΟ ΓΚΡΙ","ΔΟΚΙΜΑΣΤΙΚΟ ΜΠΕΖ"];
    var rows = ["Κωδικός είδους;Περιγραφή;Ομάδα;Μ.Μ.;Πάχος;Τιμή πώλησης;Τιμή κόστους;Απόθεμα;Ενεργό"];
    for(var i = 1; i <= 60; i++){
      var g = groups[i % 3], th = i % 2 ? 2 : 3;
      rows.push(["ΕΙΔ-" + String(i).padStart(3, "0"), g + " " + th + "cm " + (i % 4 ? "ΓΥΑΛΙΣΤΟ" : "ΜΑΤ"), g,
                 i % 5 ? "τ.μ." : "μ.μ.", th, (40 + i).toFixed(2).replace(".", ","),
                 (22 + i / 2).toFixed(2).replace(".", ","), 10 * i, i % 10 === 0 ? "Όχι" : "Ναι"].join(";"));
    }
    return {name:"δοκιμαστικό-είδη.csv", text:rows.join("\r\n")};
  },
  /* Το ίδιο πρόβλημα με τα αρχεία της 09/09: μόνο κωδικός + «Message» */
  bad:function(){
    var data = []; for(var i = 0; i < 40; i++) data.push({ID:1000 + i, Message:"ΟΛΟΙ"});
    return {name:"δοκιμή-χωρίς-στήλες.json",
            text:JSON.stringify({TCustomer:[{MainTable:"CUSTOMER", KeyField:"ID", Caption:"Διαχείριση πελατών", Data:data}]}, null, 2)};
  }
};
function mniDemo(kind){
  var type = kind === "bad" ? (MNI.type || "customers") : kind;
  MNI.type = type; MNI.mode = "merge"; MNI.activeOnly = true; MNI.result = null;
  MNI.grp = "auto"; MNI.skipKinds = true;
  var f = MNI_DEMO[kind]();
  return mniLoadBytes(f.name, new TextEncoder().encode(f.text));
}

/* ============================================================
   ΟΔΗΓΟΣ — καρτέλα «Εισαγωγή δεδομένων» (Φ28β)
   Ίδιο μοτίβο με το «Δελτίο παραγγελίας»: σχηματική εικόνα,
   Τι βλέπεις · Τι κάνει · Βήμα-βήμα · Αποτέλεσμα · Δοκίμασέ το
   ============================================================ */
var MP = {};
var MP_F = 'font-family="Inter,sans-serif"', MP_C = 'font-family="Roboto Condensed,sans-serif" font-weight="900"';
function mpBtn(x, y, w, t, dark){
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="24" rx="3" fill="' + (dark ? '#111' : '#fff') + '" stroke="#111"/>'
    + '<text x="' + (x + w / 2) + '" y="' + (y + 16) + '" font-size="8.5" text-anchor="middle" ' + MP_C + ' fill="' + (dark ? '#E1DDAE' : '#111') + '">' + t + '</text>';
}
function mpKpi(x, y, lab, val, note, warn){
  return '<rect x="' + x + '" y="' + y + '" width="150" height="58" rx="4" fill="#fff" stroke="' + (warn ? '#b3261e' : '#ddd') + '"/>'
    + '<text x="' + (x + 10) + '" y="' + (y + 16) + '" font-size="7.5" fill="#8a8a82" ' + MP_C + '>' + lab + '</text>'
    + '<text x="' + (x + 10) + '" y="' + (y + 38) + '" font-size="17" ' + MP_C + ' fill="' + (warn ? '#b3261e' : '#111') + '">' + val + '</text>'
    + '<text x="' + (x + 10) + '" y="' + (y + 51) + '" font-size="7.5" fill="#666">' + note + '</text>';
}
function mpArrow(x1, y1, x2, y2){
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#D81B8C" stroke-width="2" marker-end="url(#mpar)"/>';
}
var MP_DEFS = '<defs><marker id="mpar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
  + '<path d="M2 1L8 5L2 9" fill="none" stroke="#D81B8C" stroke-width="1.8"/></marker></defs>';

MP.where = '<svg viewBox="0 0 700 190" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>' + MP_DEFS
+ '<rect width="700" height="190" fill="#FAF9F5"/>'
+ '<rect x="0" y="0" width="700" height="30" fill="#111"/>'
+ '<rect x="70" y="7" width="74" height="17" rx="2" fill="#E1DDAE"/><text x="107" y="19" font-size="8.5" text-anchor="middle" ' + MP_C + '>ΔΙΑΧΕΙΡΙΣΗ</text>'
+ '<text x="160" y="19" font-size="8.5" fill="#8a8a82" ' + MP_C + '>ΠΩΛΗΣΕΙΣ</text>'
+ '<rect x="0" y="30" width="170" height="160" fill="#F1EFE8"/>'
+ '<text x="12" y="52" font-size="7" fill="#8a8a82" ' + MP_C + '>ΡΥΘΜΙΣΕΙΣ</text>'
+ '<text x="12" y="72" font-size="9.5" fill="#444">Παράμετροι κόστους</text>'
+ '<rect x="0" y="80" width="170" height="24" fill="#fff"/><rect x="0" y="80" width="3" height="24" fill="#111"/>'
+ '<text x="12" y="96" font-size="9.5" font-weight="700">Εισαγωγή δεδομένων</text>'
+ '<text x="12" y="120" font-size="9.5" fill="#444">Οδηγός χρήσης</text>'
+ '<text x="12" y="142" font-size="9.5" fill="#444">Χρήστες</text>'
+ '<text x="36" y="176" font-size="8.5" fill="#D81B8C" font-weight="700">Δρόμος 1: από το μενού</text>'
+ '<text x="200" y="60" font-size="15" ' + MP_C + '>ΠΕΛΑΤΕΣ</text>'
+ '<text x="200" y="76" font-size="8" fill="#8a8a82">Πωλήσεις → Πελάτες</text>'
+ mpBtn(200, 92, 120, "+ ΝΕΟΣ ΠΕΛΑΤΗΣ", true)
+ mpBtn(328, 92, 160, "ΕΙΣΑΓΩΓΗ ΠΕΛΑΤΟΛΟΓΙΟΥ", false)
+ '<rect x="324" y="88" width="168" height="32" rx="5" fill="none" stroke="#D81B8C" stroke-width="2"/>'
+ '<text x="506" y="100" font-size="8" fill="#444">Το ίδιο κουμπί υπάρχει και στους</text>'
+ '<text x="506" y="112" font-size="8" fill="#444">Προμηθευτές και στα Προϊόντα</text>'
+ '<text x="330" y="146" font-size="8.5" fill="#D81B8C" font-weight="700">Δρόμος 2: από τη λίστα</text>'
+ '</svg>';

MP.pick = '<svg viewBox="0 0 700 170" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>' + MP_DEFS
+ '<rect width="700" height="170" fill="#FAF9F5"/>'
+ '<text x="16" y="24" font-size="9" fill="#8a8a82" ' + MP_C + '>1. ΤΙ ΦΕΡΝΕΤΕ</text>'
+ mpBtn(16, 34, 90, "ΠΕΛΑΤΕΣ", true) + mpBtn(112, 34, 110, "ΠΡΟΜΗΘΕΥΤΕΣ", false) + mpBtn(228, 34, 120, "ΕΙΔΗ ΑΠΟΘΗΚΗΣ", false)
+ mpBtn(16, 72, 130, "ΕΠΙΛΟΓΗ ΑΡΧΕΙΟΥ…", true)
+ '<text x="156" y="88" font-size="9"><tspan font-weight="700">πελάτες.xlsx</tspan> · Excel (.xlsx) · «Πελάτες» · 4.373 γραμμές</text>'
+ '<text x="16" y="120" font-size="8" fill="#666">Μορφές που διαβάζονται: Excel (.xlsx), Excel 97–2003 (.xls), JSON, XML, CSV / κείμενο.</text>'
+ '<text x="16" y="142" font-size="8" fill="#444">Δεν έχετε αρχείο;</text>'
+ mpBtn(100, 128, 150, "ΔΟΚΙΜΑΣΤΙΚΟ ΑΡΧΕΙΟ", false) + mpBtn(256, 128, 150, "ΑΡΧΕΙΟ ΧΩΡΙΣ ΣΤΗΛΕΣ", false)
+ '<text x="430" y="40" font-size="8.5" fill="#D81B8C" font-weight="700">① Πρώτα τι φέρνετε</text>'
+ '<text x="430" y="86" font-size="8.5" fill="#D81B8C" font-weight="700">② Μετά το αρχείο — βλέπετε</text>'
+ '<text x="430" y="98" font-size="8.5" fill="#D81B8C" font-weight="700">    όνομα, μορφή, πλήθος γραμμών</text>'
+ '<text x="430" y="144" font-size="8.5" fill="#D81B8C" font-weight="700">③ Ή δοκιμή χωρίς δικό σας αρχείο</text>'
+ '</svg>';

MP.map = '<svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>'
+ '<rect width="700" height="200" fill="#FAF9F5"/>'
+ '<text x="16" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>2. ΠΟΙΑ ΣΤΗΛΗ ΕΙΝΑΙ ΤΙ</text>'
+ '<rect x="16" y="30" width="668" height="160" rx="4" fill="#fff" stroke="#ddd"/>'
+ ['ΣΤΗΛΗ ΑΡΧΕΙΟΥ','ΔΕΙΓΜΑ','ΠΕΔΙΟ ΣΤΗΝ ΕΦΑΡΜΟΓΗ'].map(function(t, i){
    return '<text x="' + [28, 170, 470][i] + '" y="48" font-size="7.5" fill="#8a8a82" ' + MP_C + '>' + t + '</text>'; }).join("")
+ [["Κωδικός","ΔΟΚ-001 · ΔΟΚ-002 · ΔΟΚ-003","Κωδικός στο πρόγραμμα",0],
   ["Επωνυμία","ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 001 · …","Επωνυμία *",0],
   ["ΑΦΜ","100079190 · 100158389 · …","ΑΦΜ",0],
   ["Παρατηρήσεις γραφείου","πληρώνει με επιταγή · …","— να μη μπει —",1],
   ["Ενεργός","Ναι · Ναι · Όχι","Ενεργός / Ανενεργός",0]]
  .map(function(r, i){ var y = 58 + i * 26;
    return '<line x1="16" y1="' + y + '" x2="684" y2="' + y + '" stroke="#eee"/>'
      + '<text x="28" y="' + (y + 17) + '" font-size="9.5" font-weight="700" fill="' + (r[3] ? '#aaa' : '#111') + '">' + r[0] + '</text>'
      + '<text x="170" y="' + (y + 17) + '" font-size="8.5" fill="#8a8a82">' + r[1] + '</text>'
      + '<rect x="470" y="' + (y + 4) + '" width="200" height="18" rx="2" fill="#fff" stroke="' + (r[3] ? '#bbb' : '#111') + '"/>'
      + '<text x="478" y="' + (y + 17) + '" font-size="9" fill="' + (r[3] ? '#999' : '#111') + '">' + r[2] + '</text>'
      + '<text x="660" y="' + (y + 17) + '" font-size="8">▾</text>'; }).join("")
+ '<text x="470" y="198" font-size="7.5" fill="#D81B8C" font-weight="700">* υποχρεωτικό · γκρι γραμμή = δεν θα μπει</text>'
+ '</svg>';

MP.check = '<svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>'
+ '<rect width="700" height="200" fill="#FAF9F5"/>'
+ '<text x="16" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>3. ΤΙ ΘΑ ΜΠΕΙ</text>'
+ mpKpi(16, 30, "ΓΡΑΜΜΕΣ ΑΡΧΕΙΟΥ", "82", "")
+ mpKpi(186, 30, "ΘΑ ΜΠΟΥΝ", "67", "όλες νέες")
+ mpKpi(356, 30, "ΠΑΡΑΛΕΙΠΟΝΤΑΙ", "15", "3 χωρίς όνομα · 2 διπλές · 10 ανενεργές", true)
+ mpKpi(526, 30, "ΠΡΟΣ ΕΛΕΓΧΟ", "5", "2 ΑΦΜ · 3 email — μπαίνουν", true)
+ '<rect x="16" y="100" width="12" height="12" rx="2" fill="#111"/><text x="19" y="110" font-size="9" fill="#fff">✓</text>'
+ '<text x="36" y="110" font-size="9.5">Μόνο ενεργοί (10 ανενεργές μένουν έξω)</text>'
+ '<rect x="16" y="122" width="668" height="70" rx="4" fill="#fff" stroke="#ddd"/>'
+ [["ΔΟΚ-004","ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 004","100316765","","pelatis004@example.gr",""],
   ["ΔΟΚ-005","ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 005","100395951","ΑΦΜ","pelatis005@example.gr",""],
   ["ΔΟΚ-012","ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 012","100950280","","pelatis012-xoris-papaki","MAIL"]]
  .map(function(r, i){ var y = 142 + i * 20;
    return '<text x="28" y="' + y + '" font-size="8.5">' + r[0] + '</text>'
      + '<text x="96" y="' + y + '" font-size="8.5">' + r[1] + '</text>'
      + '<text x="300" y="' + y + '" font-size="8.5">' + r[2] + '</text>'
      + (r[3] ? '<rect x="352" y="' + (y - 9) + '" width="44" height="12" rx="2" fill="#fbe9e7"/><text x="374" y="' + y + '" font-size="7.5" text-anchor="middle" fill="#b3261e" font-weight="700">έλεγχος</text>' : '')
      + '<text x="430" y="' + y + '" font-size="8.5">' + r[4] + '</text>'
      + (r[5] ? '<rect x="560" y="' + (y - 9) + '" width="44" height="12" rx="2" fill="#fbe9e7"/><text x="582" y="' + y + '" font-size="7.5" text-anchor="middle" fill="#b3261e" font-weight="700">έλεγχος</text>' : '');
  }).join("")
+ '</svg>';

MP.mode = '<svg viewBox="0 0 700 170" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>'
+ '<rect width="700" height="170" fill="#FAF9F5"/>'
+ '<text x="16" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>4. ΠΩΣ ΜΠΑΙΝΟΥΝ</text>'
+ '<circle cx="24" cy="44" r="6" fill="#fff" stroke="#111"/>'
+ '<text x="38" y="48" font-size="9.5"><tspan font-weight="700">Προσθήκη και ενημέρωση.</tspan> Τα δοκιμαστικά μένουν. Ίδιος κωδικός → ενημερώνεται, δεν διπλασιάζεται.</text>'
+ '<circle cx="24" cy="74" r="6" fill="#fff" stroke="#111"/><circle cx="24" cy="74" r="3" fill="#111"/>'
+ '<text x="38" y="78" font-size="9.5"><tspan font-weight="700">Αντικατάσταση των δοκιμαστικών.</tspan> Φεύγουν οι 8 ψεύτικοι πελάτες και οι κινήσεις τους:</text>'
+ '<text x="38" y="92" font-size="9.5">5 παραγγελίες, 5 προσφορές, 7 παραστατικά, 8 δελτία. Όλα επανέρχονται με «Επαναφορά».</text>'
+ mpBtn(16, 116, 170, "ΕΙΣΑΓΩΓΗ 67 ΕΓΓΡΑΦΩΝ", true) + mpBtn(194, 116, 90, "ΑΚΥΡΩΣΗ", false)
+ '<rect x="400" y="108" width="284" height="44" rx="4" fill="#fff" stroke="#ddd"/>'
+ '<text x="412" y="126" font-size="8.5" font-weight="700">Επιβεβαίωση</text>'
+ '<text x="412" y="142" font-size="8">«Θα αφαιρεθούν 8 δοκιμαστικοί πελάτες… Συνέχεια;»</text>'
+ '</svg>';

MP.done = '<svg viewBox="0 0 700 170" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>'
+ '<rect width="700" height="170" fill="#FAF9F5"/>'
+ '<rect x="16" y="12" width="668" height="38" rx="3" fill="#F1EDD6" stroke="#E1DDAE"/>'
+ '<text x="28" y="30" font-size="9"><tspan font-weight="700">Mockup — Φάση 1.</tspan> Περιέχει <tspan font-weight="700">πραγματικά δεδομένα από εισαγωγή</tspan>,</text>'
+ '<text x="28" y="43" font-size="9">αποθηκευμένα μόνο σε αυτόν τον υπολογιστή. Τα υπόλοιπα είναι δοκιμαστικά.</text>'
+ '<rect x="16" y="64" width="668" height="40" rx="3" fill="#fff" stroke="#ddd"/><rect x="16" y="64" width="3" height="40" fill="#2e7d32"/>'
+ '<text x="30" y="88" font-size="9.5"><tspan font-weight="700">Έγινε.</tspan> 67 νέες, 0 ενημερώσεις, 15 παραλείφθηκαν. Αφαιρέθηκαν 8 δοκιμαστικοί πελάτες.</text>'
+ mpBtn(540, 72, 132, "ΑΝΟΙΓΜΑ: ΠΕΛΑΤΕΣ", false)
+ '<text x="16" y="130" font-size="9" fill="#8a8a82" ' + MP_C + '>ΠΕΛΑΤΕΣ</text>'
+ '<text x="16" y="148" font-size="9.5" font-weight="700">ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 001</text>'
+ '<text x="16" y="160" font-size="8" fill="#8a8a82">CL-ΔΟΚ-001 · ΑΦΜ 100079190</text>'
+ '<text x="300" y="148" font-size="9">Χωρίς κατηγορία · Ιωάννινα · • Εισαγωγή</text>'
+ '<rect x="600" y="138" width="60" height="16" rx="2" fill="#fff" stroke="#2e7d32"/><text x="630" y="150" font-size="8" text-anchor="middle" fill="#2e7d32" font-weight="700">ΕΝΕΡΓΟΣ</text>'
+ '</svg>';

MP.hist = '<svg viewBox="0 0 700 150" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>'
+ '<rect width="700" height="150" fill="#FAF9F5"/>'
+ '<text x="16" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>ΙΣΤΟΡΙΚΟ ΕΙΣΑΓΩΓΩΝ</text>'
+ '<rect x="16" y="30" width="668" height="76" rx="4" fill="#fff" stroke="#ddd"/>'
+ ['ΠΟΤΕ','ΤΙ','ΑΡΧΕΙΟ','ΝΕΕΣ','ΕΝΗΜ.','ΤΡΟΠΟΣ'].map(function(t, i){
    return '<text x="' + [28, 150, 250, 470, 520, 580][i] + '" y="46" font-size="7.5" fill="#8a8a82" ' + MP_C + '>' + t + '</text>'; }).join("")
+ '<text x="28" y="68" font-size="8.5">2026-09-16 10:42</text><text x="150" y="68" font-size="8.5">Πελάτες</text>'
+ '<text x="250" y="68" font-size="8.5">δοκιμαστικό-πελάτες.csv</text><text x="470" y="68" font-size="8.5">67</text><text x="520" y="68" font-size="8.5">0</text>'
+ '<rect x="580" y="58" width="80" height="14" rx="2" fill="#fff4d6"/><text x="620" y="69" font-size="7.5" text-anchor="middle" fill="#a86b00" font-weight="700">αντικατάσταση</text>'
+ '<text x="28" y="92" font-size="8.5">2026-09-16 10:55</text><text x="150" y="92" font-size="8.5">Πελάτες</text>'
+ '<text x="250" y="92" font-size="8.5">Επαναφορά — αφαιρέθηκαν 67</text>'
+ mpBtn(16, 116, 150, "ΕΠΑΝΑΦΟΡΑ: ΠΕΛΑΤΕΣ", false)
+ '<rect x="12" y="112" width="158" height="32" rx="5" fill="none" stroke="#D81B8C" stroke-width="2"/>'
+ '<text x="190" y="132" font-size="8.5" fill="#444">Φεύγουν οι εισαγμένοι, επιστρέφουν οι 8 δοκιμαστικοί με όλες τις κινήσεις τους.</text>'
+ '</svg>';

MP.bad = '<svg viewBox="0 0 700 110" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>'
+ '<rect width="700" height="110" fill="#FAF9F5"/>'
+ '<rect x="16" y="14" width="668" height="82" rx="3" fill="#fff" stroke="#ddd"/><rect x="16" y="14" width="3" height="82" fill="#b3261e"/>'
+ '<text x="30" y="36" font-size="10" font-weight="700">Το αρχείο δεν μπορεί να μπει.</text>'
+ '<text x="30" y="54" font-size="9">Το αρχείο έχει μόνο τον εσωτερικό κωδικό κάθε εγγραφής (40 εγγραφές, στήλες: ID, Message)</text>'
+ '<text x="30" y="68" font-size="9">— η εξαγωγή έγινε χωρίς στήλες. Ζητήστε νέα εξαγωγή με τις στήλες ορατές</text>'
+ '<text x="30" y="82" font-size="9">(επωνυμία, ΑΦΜ, διεύθυνση, τηλέφωνα…).</text>'
+ '</svg>';

MP.store = '<svg viewBox="0 0 700 150" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>' + MP_DEFS
+ '<rect width="700" height="150" fill="#FAF9F5"/>'
+ '<rect x="20" y="30" width="180" height="96" rx="6" fill="#fff" stroke="#111"/>'
+ '<text x="110" y="52" font-size="10" text-anchor="middle" ' + MP_C + '>ΤΟ ΑΡΧΕΙΟ ΣΑΣ</text>'
+ '<text x="110" y="72" font-size="8.5" text-anchor="middle" fill="#444">από το εμπορικό πρόγραμμα</text>'
+ '<text x="110" y="100" font-size="8.5" text-anchor="middle" fill="#444">κρατήστε το — είναι</text>'
+ '<text x="110" y="112" font-size="8.5" text-anchor="middle" fill="#444">το αντίγραφο ασφαλείας</text>'
+ mpArrow(204, 78, 256, 78)
+ '<rect x="260" y="30" width="190" height="96" rx="6" fill="#E1DDAE" stroke="#111"/>'
+ '<text x="355" y="52" font-size="10" text-anchor="middle" ' + MP_C + '>ΑΥΤΟΣ Ο BROWSER</text>'
+ '<text x="355" y="72" font-size="8.5" text-anchor="middle">σε αυτόν τον υπολογιστή</text>'
+ '<text x="355" y="100" font-size="8.5" text-anchor="middle">εδώ μένουν οι πελάτες σας</text>'
+ '<rect x="490" y="30" width="190" height="96" rx="6" fill="#fff" stroke="#bbb" stroke-dasharray="5 4"/>'
+ '<text x="585" y="52" font-size="10" text-anchor="middle" fill="#999" ' + MP_C + '>GITHUB / INTERNET</text>'
+ '<text x="585" y="80" font-size="22" text-anchor="middle" fill="#b3261e">✕</text>'
+ '<text x="585" y="104" font-size="8.5" text-anchor="middle" fill="#999">δεν ανεβαίνει τίποτα</text>'
+ '<text x="350" y="144" font-size="8" text-anchor="middle" fill="#8a8a82">Άλλος υπολογιστής ή άλλος browser δεν τα βλέπει — χρειάζεται νέα εισαγωγή εκεί</text>'
+ '</svg>';

MP.items = '<svg viewBox="0 0 700 170" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>' + MP_DEFS
+ '<rect width="700" height="170" fill="#FAF9F5"/>'
+ '<text x="20" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>ΣΤΟ ΠΡΟΓΡΑΜΜΑ ΣΑΣ: ΕΙΔΗ</text>'
+ [['021.0.000','ΔΕΜΑΤΙΟΥ ΣΕ Μ3'],['021.0.002','ΔΕΜΑΤΙΟΥ 0,02 ΣΕ Μ2'],['021.0.003','ΔΕΜΑΤΙΟΥ 0,03 ΣΕ Μ2'],
   ['021.0.012','ΔΕΜΑΤΙΟΥ 0,02 ΣΕ ΜΜ'],['021.0.009','ΔΕΜΑΤΙΟΥ ΣΕ ΤΟΝΝΟΥΣ']]
  .map(function(t, i){ var y = 32 + i * 26;
    return '<rect x="20" y="' + y + '" width="236" height="20" rx="3" fill="#fff" stroke="#ddd"/>'
      + '<text x="28" y="' + (y + 14) + '" font-size="8.5"><tspan font-weight="700" fill="#D81B8C">021</tspan>' + t[0].slice(3) + '</text>'
      + '<text x="96" y="' + (y + 14) + '" font-size="8.5">' + t[1] + '</text>'; }).join("")
+ mpArrow(262, 90, 312, 90)
+ '<text x="266" y="80" font-size="7.5" fill="#D81B8C" font-weight="700">κωδικός</text>'
+ '<text x="322" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>ΣΤΗΝ ΕΦΑΡΜΟΓΗ: ΠΡΟΪΟΝ PX-021 → SKU</text>'
+ '<rect x="322" y="32" width="360" height="126" rx="4" fill="#fff" stroke="#111"/>'
+ '<text x="334" y="50" font-size="11" font-weight="700">ΔΕΜΑΤΙΟΥ</text>'
+ [['021.0.000','Όγκος','m³'],['021.0.002','Πλάκα 2 cm','m²'],['021.0.003','Πλάκα 3 cm','m²'],
   ['021.0.012','Τρέχον μέτρο · 2 cm','μ.μ.'],['021.0.009','Χύμα (τόνοι)','τόνοι']]
  .map(function(t, i){ var y = 70 + i * 18;
    return '<text x="334" y="' + y + '" font-size="8.5" font-weight="700">' + t[0] + '</text>'
      + '<text x="410" y="' + y + '" font-size="8.5">' + t[1] + '</text>'
      + '<text x="620" y="' + y + '" font-size="8.5" fill="#666">' + t[2] + '</text>'; }).join("")
+ '</svg>';

GUIDE.imp = {cards:[]};
var G = function(c){ GUIDE.imp.cards.push(c); };

G({ic:"★", t:{el:"Γρήγορα — Φόρτωση των πραγματικών δεδομένων με κωδικό", en:"Quick — Loading the real data with a code"},
  see:{el:"Στην κορυφή της οθόνης «Εισαγωγή δεδομένων», ένα πλαίσιο «Πραγματικά δεδομένα της εταιρείας» με πεδίο «Κωδικός» και κουμπί «Φόρτωση πραγματικών δεδομένων». Ο ίδιος σύνδεσμος υπάρχει και στο κίτρινο banner κάθε οθόνης.",
       en:"At the top of the «Data import» screen, a «Company's real data» box with a «Code» field and a «Load real data» button. The same link also sits in the yellow banner on every screen."},
  does:{el:"Φέρνει μαζί πελάτες, προμηθευτές και είδη από το εμπορικό σας πρόγραμμα, χωρίς να χρειαστεί να έχετε ή να διαλέξετε αρχεία. Τα αρχεία βρίσκονται στο site κρυπτογραφημένα· ανοίγουν μόνο με τον κωδικό. Είναι ο πιο γρήγορος δρόμος για τη δοκιμή — τα Βήματα 1–11 εξηγούν τι γίνεται από πίσω.",
        en:"It brings in customers, suppliers and items from your business software in one go, without having or choosing any files. The files sit on the site encrypted; only the code opens them. It is the quickest way to run the test — Steps 1–11 explain what happens behind it."},
  steps:{el:["Ανοίξτε την εφαρμογή από τον σύνδεσμο που σας στάλθηκε και μπείτε με admin / marmara2026.",
             "Στο κίτρινο banner πατήστε «Φόρτωση πραγματικών δεδομένων» — ή Διαχείριση → Εισαγωγή δεδομένων.",
             "Στο πλαίσιο «Πραγματικά δεδομένα της εταιρείας» γράψτε τον κωδικό που σας έδωσε ο Απόστολος.",
             "Πατήστε «Φόρτωση πραγματικών δεδομένων» (ή Enter). Το κουμπί γράφει διαδοχικά «Πελάτες…», «Προμηθευτές…», «Είδη αποθήκης…».",
             "Στο τέλος, πράσινο μήνυμα με πόσα φορτώθηκαν. Οι δοκιμαστικοί πελάτες και προμηθευτές αντικαθίστανται· τα είδη μπαίνουν δίπλα στα 12 δοκιμαστικά προϊόντα.",
             "Λάθος κωδικός: κόκκινο μήνυμα «Λάθος κωδικός. Τίποτα δεν άλλαξε.» — δοκιμάστε ξανά.",
             "Κάθε υπολογιστής φορτώνει τα δικά του: η γραμματεία κάνει το ίδιο στον δικό της.",
             "Για επιστροφή στα δοκιμαστικά: «Επαναφορά: Πελάτες / Προμηθευτές / Είδη αποθήκης» στο ιστορικό (Βήμα 9)."],
         en:["Open the app from the link you were sent and sign in with admin / marmara2026.",
             "In the yellow banner click «Load real data» — or Admin → Data import.",
             "In the «Company's real data» box type the code Apostolos gave you.",
             "Click «Load real data» (or Enter). The button reads «Customers…», «Suppliers…», «Stock items…» in turn.",
             "At the end, a green message says how much was loaded. Sample customers and suppliers are replaced; items go in next to the 12 sample products.",
             "Wrong code: red message «Wrong code. Nothing changed.» — try again.",
             "Each computer loads its own copy: the office does the same on theirs.",
             "To return to the sample data: «Restore: Customers / Suppliers / Stock items» in the history (Step 9)."]},
  res:{el:"Η εφαρμογή δείχνει τους δικούς σας πελάτες, προμηθευτές και υλικά — έτοιμη για τη δοκιμή.",
       en:"The app shows your own customers, suppliers and materials — ready for the test."},
  go:"mniGo('customers')"});

G({ic:"①", t:{el:"Βήμα 1 — Πού βρίσκεται", en:"Step 1 — Where to find it"},
  pic:MP.where, picCap:{el:"Δύο δρόμοι: από το αριστερό μενού της Διαχείρισης, ή από το κουμπί δίπλα στο «+ Νέος» κάθε λίστας.",
                        en:"Two ways in: from the Admin side menu, or from the button next to «+ New» on each list."},
  see:{el:"Στη Διαχείριση, στην ομάδα «Ρυθμίσεις» του αριστερού μενού, η δεύτερη επιλογή λέγεται «Εισαγωγή δεδομένων». Το ίδιο εργαλείο ανοίγει και από τρία κουμπιά μέσα στις λίστες: «Εισαγωγή πελατολογίου», «Εισαγωγή προμηθευτών», «Εισαγωγή ειδών».",
       en:"Under Admin, in the «Settings» group of the side menu, the second item is «Data import». The same tool also opens from three buttons inside the lists: «Import customers», «Import suppliers», «Import items»."},
  does:{el:"Φέρνει στην εφαρμογή τους πελάτες, τους προμηθευτές και τα είδη που ήδη έχετε στο εμπορικό σας πρόγραμμα, ώστε να μη χρειαστεί να τα ξαναγράψετε ένα-ένα. Είναι ένα εργαλείο για τα τρία — η διαδικασία είναι ίδια.",
        en:"It brings into the app the customers, suppliers and items you already hold in your business software, so you do not have to retype them one by one. One tool for all three — the procedure is the same."},
  steps:{el:["Μπείτε με admin / marmara2026.",
             "Πάνω μπάρα: «ΔΙΑΧΕΙΡΙΣΗ» (ανοίγει μόνη της μετά την είσοδο).",
             "Αριστερό μενού, ομάδα «Ρυθμίσεις»: πατήστε «Εισαγωγή δεδομένων».",
             "Εναλλακτικά: Πωλήσεις → Πελάτες → κουμπί «Εισαγωγή πελατολογίου», δίπλα στο «+ Νέος πελάτης». Ανοίγει την ίδια οθόνη με τους «Πελάτες» ήδη επιλεγμένους.",
             "Αντίστοιχα: Πωλήσεις → Προμηθευτές → «Εισαγωγή προμηθευτών», και Διαχείριση → Προϊόντα → «Εισαγωγή ειδών».",
             "Αν δεν βλέπετε την επιλογή, πατήστε Ctrl+F5 — ο browser κρατάει ακόμα την παλιά έκδοση."],
         en:["Sign in with admin / marmara2026.",
             "Top bar: «ADMIN» (opens by itself after signing in).",
             "Side menu, «Settings» group: click «Data import».",
             "Alternatively: Sales → Customers → «Import customers», next to «+ New customer». It opens the same screen with «Customers» already selected.",
             "Likewise: Sales → Suppliers → «Import suppliers», and Admin → Products → «Import items».",
             "If you cannot see it, press Ctrl+F5 — the browser is still holding the old version."]},
  res:{el:"Η οθόνη «Εισαγωγή δεδομένων» ανοιχτή. Πάνω τέσσερις δείκτες: πόσοι πελάτες, προμηθευτές και είδη υπάρχουν τώρα, και πόσος τοπικός χώρος χρησιμοποιείται.",
       en:"The «Data import» screen is open. At the top four indicators: how many customers, suppliers and items exist now, and how much local storage is in use."},
  go:"mniGo('customers')"});

G({ic:"②", t:{el:"Βήμα 2 — Ετοιμάστε το αρχείο στο πρόγραμμά σας", en:"Step 2 — Prepare the file in your software"},
  see:{el:"Αυτό το βήμα γίνεται ΕΞΩ από την εφαρμογή, στο εμπορικό πρόγραμμα που χρησιμοποιείτε σήμερα — στην οθόνη «Διαχείριση πελατών» ή «Διαχείριση ειδών αποθήκης».",
       en:"This step happens OUTSIDE the app, in the business software you use today — on its «Customer management» or «Stock items» screen."},
  does:{el:"Η εφαρμογή διαβάζει ό,τι στήλες βγάλει το πρόγραμμά σας. Αν η εξαγωγή γίνει χωρίς στήλες, βγαίνει ένα αρχείο που μοιάζει μεγάλο αλλά έχει μόνο κωδικούς — αυτό ακριβώς έγινε με τα πρώτα αρχεία στις 09/09. Η εφαρμογή το καταλαβαίνει και το απορρίπτει, αλλά είναι καλύτερο να βγει σωστά από την αρχή.",
        en:"The app reads whatever columns your software exports. If the export runs without columns, you get a file that looks big but holds only codes — exactly what happened with the first files on 09/09. The app detects and rejects it, but it is better to export it right from the start."},
  steps:{el:["Στη λίστα πελατών του προγράμματος, κάντε ορατές τις στήλες: Κωδικός, Επωνυμία, ΑΦΜ, ΔΟΥ, Επάγγελμα, Διεύθυνση, Πόλη, Τ.Κ., Τηλέφωνο, Κινητό, Email, Κατηγορία, Ενεργός/Ανενεργός, Υπόλοιπο.",
             "Για προμηθευτές: οι ίδιες στήλες, και IBAN αν υπάρχει.",
             "Για είδη: Κωδικός, Περιγραφή, Ομάδα, Μονάδα μέτρησης, Πάχος, Φινίρισμα, Τιμή πώλησης, Τιμή κόστους, ΦΠΑ, Απόθεμα, Ενεργό, Barcode.",
             "Η στήλη «Ενεργός» είναι σημαντική: χωρίς αυτή μπαίνουν και οι πελάτες που έχετε χρόνια να δείτε. Αν σχεδόν όλοι είναι «Ναι» — όπως στη σημερινή σας εξαγωγή — ζητήστε και στήλη «Τελευταία κίνηση» ή «Τζίρος».",
             "Εξάγετε σε Excel (.xlsx). Αν το πρόγραμμα δίνει CSV, JSON ή XML, κι αυτά διαβάζονται.",
             "Το παλιό Excel (.xls, 97–2003) — αυτό που βγάζει το πρόγραμμά σας, π.χ. «ΠΕΛΑΤΕΣ.xls» — διαβάζεται κατευθείαν, χωρίς μετατροπή. Μόνο Excel 95 και παλιότερο θέλει «Αποθήκευση ως» → .xlsx.",
             "Αν η λίστα ειδών δεν έχει τιμή και απόθεμα (όπως η σημερινή), τα είδη μπαίνουν με τιμή 0. Οι τιμές συμπληρώνονται μετά στο προϊόν, ή έρχονται με νέα εξαγωγή που τις περιέχει.",
             "Ανοίξτε το αρχείο μία φορά πριν το φέρετε: η πρώτη γραμμή πρέπει να έχει ονόματα στηλών και από κάτω να φαίνονται πραγματικές επωνυμίες.",
             "Αν το πρόγραμμα δίνει κάποια άλλη μορφή, στείλτε μας ένα μικρό δείγμα — προστίθεται χωρίς να αλλάξει τίποτα άλλο."],
         en:["In the software's customer list, make these columns visible: Code, Name, VAT no., Tax office, Occupation, Address, City, Postcode, Phone, Mobile, Email, Category, Active/Inactive, Balance.",
             "For suppliers: the same columns, plus IBAN if available.",
             "For items: Code, Description, Group, Unit, Thickness, Finish, Sale price, Cost price, VAT rate, Stock, Active, Barcode.",
             "The «Active» column matters: without it, customers you have not seen in years come in too. If nearly all say «Yes» — as in your current export — ask for a «Last transaction» or «Turnover» column as well.",
             "Export to Excel (.xlsx). If the software gives CSV, JSON or XML, those are read as well.",
             "Old Excel (.xls, 97–2003) — what your software produces, e.g. «ΠΕΛΑΤΕΣ.xls» — is read directly, with no conversion. Only Excel 95 and older needs «Save as» → .xlsx.",
             "If the item list has no price or stock (like the current one), items come in at price 0. Prices are filled in later on the product, or arrive with a new export that includes them.",
             "Open the file once before bringing it in: the first row must hold column names, with real company names below.",
             "If the software offers some other format, send us a small sample — it is added without changing anything else."]},
  res:{el:"Ένα αρχείο με ονόματα στηλών στην πρώτη γραμμή και μία εγγραφή σε κάθε γραμμή από κάτω.",
       en:"A file with column names in the first row and one record on each row below."}});

G({ic:"③", t:{el:"Βήμα 3 — Διαλέξτε τι φέρνετε και το αρχείο", en:"Step 3 — Choose what you bring and the file"},
  pic:MP.pick, picCap:{el:"Πρώτα το είδος, μετά το αρχείο. Χωρίς δικό σας αρχείο, το «Δοκιμαστικό αρχείο» φτιάχνει ένα με γνωστά νούμερα.",
                       en:"First the kind, then the file. Without a file of your own, «Sample file» creates one with known numbers."},
  see:{el:"Ενότητα «1. Τι φέρνετε»: τρία κουμπιά — Πελάτες, Προμηθευτές, Είδη αποθήκης — και από κάτω το «Επιλογή αρχείου…». Μετά την επιλογή εμφανίζεται δίπλα το όνομα, η μορφή και το πλήθος γραμμών.",
       en:"Section «1. What you bring»: three buttons — Customers, Suppliers, Stock items — and below them «Choose file…». Once chosen, the name, format and row count appear beside it."},
  does:{el:"Ανοίγει το αρχείο μέσα στον browser, χωρίς να το στείλει πουθενά. Βρίσκει μόνη της τη γραμμή με τα ονόματα των στηλών — ακόμα κι αν πάνω από αυτήν το πρόγραμμα έχει γράψει τίτλο ή κενές γραμμές.",
        en:"It opens the file inside the browser, without sending it anywhere. It finds the column-name row by itself — even if the software wrote a title or blank lines above it."},
  steps:{el:["Πατήστε το είδος: «Πελάτες». Γίνεται μαύρο.",
             "Πατήστε «Επιλογή αρχείου…» και διαλέξτε το αρχείο από τον υπολογιστή σας.",
             "Δίπλα στο κουμπί ελέγξτε: όνομα αρχείου, μορφή (π.χ. Excel .xlsx), όνομα φύλλου και πλήθος γραμμών. Αν οι γραμμές είναι πολύ λιγότερες ή πολύ περισσότερες απ' όσες περιμένετε, σταματήστε εδώ.",
             "ΧΩΡΙΣ ΔΙΚΟ ΣΑΣ ΑΡΧΕΙΟ: πατήστε «Δοκιμαστικό αρχείο». Για πελάτες φτιάχνει 82 γραμμές με επίτηδες λάθη, ώστε να δείτε όλους τους ελέγχους.",
             "Για να δείτε πώς απορρίπτεται λάθος εξαγωγή, πατήστε «Αρχείο χωρίς στήλες».",
             "Για να φέρετε άλλο αρχείο, πατήστε ξανά το κουμπί — τώρα γράφει «Άλλο αρχείο…»."],
         en:["Click the kind: «Customers». It turns black.",
             "Click «Choose file…» and pick the file from your computer.",
             "Beside the button check: file name, format (e.g. Excel .xlsx), sheet name and row count. If the rows are far fewer or far more than you expect, stop here.",
             "WITHOUT A FILE OF YOUR OWN: click «Sample file». For customers it creates 82 rows with deliberate mistakes, so you see every check.",
             "To see how a wrong export is rejected, click «File without columns».",
             "To bring another file, click the button again — it now reads «Another file…»."]},
  res:{el:"Το αρχείο διαβάστηκε. Από κάτω εμφανίζονται οι ενότητες 2, 3 και 4.",
       en:"The file has been read. Sections 2, 3 and 4 appear below."},
  go:"mniGo('customers')"});

G({ic:"④", t:{el:"Βήμα 4 — Ποια στήλη είναι τι", en:"Step 4 — Which column is what"},
  pic:MP.map, picCap:{el:"Κάθε στήλη του αρχείου σε μία γραμμή, με δείγμα από τις πρώτες εγγραφές και το πεδίο όπου θα μπει.",
                      en:"Each file column on one row, with a sample from the first records and the field it will go into."},
  see:{el:"Ενότητα «2. Ποια στήλη είναι τι»: πίνακας με τρεις στήλες — «Στήλη αρχείου», «Δείγμα», «Πεδίο στην εφαρμογή». Οι γραμμές που δεν θα μπουν φαίνονται αχνές.",
       en:"Section «2. Which column is what»: a table with three columns — «File column», «Sample», «Field in the app». Rows that will not be imported look faded."},
  does:{el:"Η εφαρμογή διαβάζει τα ονόματα των στηλών και μαντεύει μόνη της: «Α.Φ.Μ.» → ΑΦΜ, «Τ.Κ.» → Τ.Κ., «Ενεργός» → Ενεργός/Ανενεργός. Εσείς ελέγχετε και διορθώνετε. Τη διόρθωσή σας τη θυμάται — την επόμενη φορά με το ίδιο αρχείο δεν τη ξανακάνετε.",
        en:"The app reads the column names and guesses on its own: «VAT no.» → VAT, «Postcode» → Postcode, «Active» → Active/Inactive. You check and correct. It remembers your correction — next time with the same file you do not redo it."},
  steps:{el:["Κοιτάξτε τη στήλη «Δείγμα»: δείχνει τις τρεις πρώτες τιμές κάθε στήλης. Έτσι βλέπετε τι περιέχει στην πράξη, όχι μόνο πώς λέγεται.",
             "Για κάθε γραμμή, ελέγξτε ότι το «Πεδίο στην εφαρμογή» ταιριάζει με το δείγμα.",
             "Αν κάτι είναι λάθος, ανοίξτε τη λίστα και διαλέξτε το σωστό πεδίο.",
             "Ό,τι δεν θέλετε να μπει, το αφήνετε ή το αλλάζετε σε «— να μη μπει —». Η γραμμή γίνεται αχνή.",
             "Κάθε πεδίο μπαίνει σε μία μόνο στήλη. Αν το διαλέξετε σε δεύτερη, φεύγει αυτόματα από την πρώτη — η λίστα το σημειώνει ως «(ήδη σε άλλη στήλη)».",
             "Η «Επωνυμία *» είναι υποχρεωτική (για είδη η «Περιγραφή *»). Χωρίς αυτήν δεν γίνεται εισαγωγή.",
             "Ο «Κωδικός στο πρόγραμμα» είναι πολύ χρήσιμος: με αυτόν, μια δεύτερη εισαγωγή ΕΝΗΜΕΡΩΝΕΙ τον ίδιο πελάτη αντί να τον διπλασιάσει.",
             "Στο δοκιμαστικό αρχείο όλες οι στήλες βρίσκονται σωστά μόνες τους — δεν χρειάζεται καμία αλλαγή."],
         en:["Look at the «Sample» column: it shows the first three values of each column. That way you see what it really holds, not just its name.",
             "For each row, check that the «Field in the app» matches the sample.",
             "If something is wrong, open the list and pick the right field.",
             "Anything you do not want imported, leave as or switch to «— do not import —». The row fades.",
             "Each field goes into one column only. If you pick it for a second one, it is removed from the first automatically — the list marks it «(already on another column)».",
             "«Name *» is mandatory (for items, «Description *»). Without it there is no import.",
             "«Code in your software» is very useful: with it, a second import UPDATES the same customer instead of duplicating them.",
             "In the sample file every column is matched correctly on its own — no change needed."]},
  res:{el:"Κάθε χρήσιμη στήλη δείχνει στο σωστό πεδίο. Η ενότητα 3 από κάτω υπολογίζεται ξανά με κάθε αλλαγή.",
       en:"Every useful column points to the right field. Section 3 below recalculates with each change."},
  go:"mniGo('customers')"});

G({ic:"⑤", t:{el:"Βήμα 5 — Τι θα μπει: οι έλεγχοι", en:"Step 5 — What will be imported: the checks"},
  pic:MP.check, picCap:{el:"Με το δοκιμαστικό αρχείο: 82 γραμμές, 67 μπαίνουν, 15 μένουν έξω, 5 θέλουν έλεγχο.",
                        en:"With the sample file: 82 rows, 67 go in, 15 stay out, 5 need checking."},
  see:{el:"Ενότητα «3. Τι θα μπει»: τέσσερις δείκτες — «Γραμμές αρχείου», «Θα μπουν», «Παραλείπονται», «Προς έλεγχο» — ο διακόπτης «Μόνο ενεργοί» και οι 12 πρώτες εγγραφές όπως θα μπουν.",
       en:"Section «3. What will be imported»: four indicators — «File rows», «Will import», «Skipped», «To check» — the «Active only» switch and the first 12 records as they will be imported."},
  does:{el:"Σας δείχνει το αποτέλεσμα ΠΡΙΝ γίνει. Τίποτα δεν έχει αλλάξει ακόμα στην εφαρμογή. Βγάζει έξω τις γραμμές χωρίς όνομα και τις διπλές, και σημαδεύει — χωρίς να τα πετάει — τα ΑΦΜ που αποτυγχάνουν στον έλεγχο του τελευταίου ψηφίου και τα email που δεν έχουν σωστή μορφή.",
        en:"It shows you the outcome BEFORE it happens. Nothing in the app has changed yet. It drops rows without a name and duplicates, and flags — without discarding — VAT numbers that fail the check-digit test and malformed emails."},
  steps:{el:["«Γραμμές αρχείου»: όσες βρήκε κάτω από τις επικεφαλίδες. Δοκιμαστικό αρχείο: 82.",
             "«Θα μπουν»: όσες θα καταχωρηθούν. Από κάτω γράφει πόσες είναι νέες και πόσες ενημερώσεις. Δοκιμαστικό: 67, όλες νέες.",
             "«Παραλείπονται»: χωρίς όνομα + διπλές + ανενεργές. Δοκιμαστικό: 15 = 3 χωρίς όνομα, 2 διπλές, 10 ανενεργές. Κόκκινο πλαίσιο σημαίνει «ρίξτε μια ματιά», όχι λάθος.",
             "Διπλή θεωρείται μια γραμμή με ίδιο κωδικό — ή, αν δεν υπάρχει κωδικός, με ίδιο σωστό ΑΦΜ ή ίδια επωνυμία. Μπαίνει μόνο η πρώτη.",
             "«Προς έλεγχο»: ΑΦΜ με λάθος ψηφίο ελέγχου και email χωρίς «@». Δοκιμαστικό: 5 = 2 ΑΦΜ + 3 email. ΜΠΑΙΝΟΥΝ κανονικά — απλώς διορθώστε τα αργότερα στην καρτέλα.",
             "«Χωρίς ΑΦΜ»: εμφανίζεται μόνο όταν υπάρχουν — κενό, 000000000 ή σύντομος αριθμός όπως «123». Μπαίνουν χωρίς ΑΦΜ. Στη σημερινή σας εξαγωγή πελατών είναι περίπου 1.650.",
             "Κάτω από τους δείκτες γράφει πόσες εγγραφές έχουν ΑΦΜ που υπάρχει ήδη σε άλλον κωδικό. Μπαίνουν χωριστά — είναι πιθανόν η ίδια εταιρεία δύο φορές στο πρόγραμμά σας.",
             "Στον πίνακα από κάτω, όποια τιμή θέλει έλεγχο έχει δίπλα κόκκινη ένδειξη «έλεγχος».",
             "«Μόνο ενεργοί»: αναμμένο από προεπιλογή. Αν το σβήσετε, μπαίνουν και οι ανενεργοί — στο δοκιμαστικό ο αριθμός γίνεται 77. Εμφανίζεται μόνο αν το αρχείο έχει στήλη Ενεργός/Ανενεργός. Αν σχεδόν όλοι είναι ενεργοί, μια πορτοκαλί σημείωση το λέει.",
             "Αν γράφει «Αντιστοιχίστε τη στήλη που έχει την Επωνυμία», γυρίστε στο Βήμα 4."],
         en:["«File rows»: all rows found under the headings. Sample file: 82.",
             "«Will import»: rows that will be saved. Below it: how many are new and how many are updates. Sample: 67, all new.",
             "«Skipped»: no name + duplicates + inactive. Sample: 15 = 3 without a name, 2 duplicates, 10 inactive. A red frame means «take a look», not an error.",
             "A duplicate is a row with the same code — or, with no code, the same valid VAT number or the same name. Only the first one goes in.",
             "«To check»: VAT numbers with a wrong check digit and emails without «@». Sample: 5 = 2 VAT + 3 email. They ARE imported — just fix them later on the card.",
             "«No VAT no.»: appears only when there are some — blank, 000000000 or a short number such as «123». They come in without a VAT number. Your current customer export has about 1,650.",
             "Below the indicators it says how many records carry a VAT number already used by another code. They come in separately — probably the same company twice in your software.",
             "In the table below, any value needing a check carries a red «check» tag beside it.",
             "«Active only»: on by default. Switch it off and inactive customers come in too — in the sample the number becomes 77. It appears only if the file has an Active/Inactive column. If nearly everyone is active, an orange note says so.",
             "If it says «Match the column that holds the Name», go back to Step 4."]},
  res:{el:"Ξέρετε ακριβώς πόσες εγγραφές θα μπουν και ποιες θέλουν διόρθωση — χωρίς να έχει αλλάξει ακόμα τίποτα.",
       en:"You know exactly how many records will be imported and which need fixing — with nothing changed yet."},
  go:"mniGo('customers')"});

G({ic:"⑥", t:{el:"Βήμα 6 — Πώς μπαίνουν: Προσθήκη ή Αντικατάσταση", en:"Step 6 — How they go in: Add or Replace"},
  pic:MP.mode, picCap:{el:"Η «Αντικατάσταση» λέει ακριβώς τι θα φύγει — και ζητάει επιβεβαίωση πριν το κάνει.",
                       en:"«Replace» states exactly what will be removed — and asks for confirmation before doing it."},
  see:{el:"Ενότητα «4. Πώς μπαίνουν»: δύο επιλογές και το κουμπί «Εισαγωγή Ν εγγραφών». Για τα είδη υπάρχει μόνο η «Προσθήκη».",
       en:"Section «4. How they go in»: two options and the «Import N records» button. For items only «Add» is available."},
  does:{el:"Η εφαρμογή έχει σήμερα 8 ψεύτικους πελάτες με ψεύτικες προσφορές, παραγγελίες και δελτία. Η «Προσθήκη» βάζει τους δικούς σας ΔΙΠΛΑ τους. Η «Αντικατάσταση» τους βγάζει μαζί με τις κινήσεις τους, ώστε να μείνουν μόνο οι πραγματικοί. Οι εντολές παραγωγής και οι πλάκες δεν σβήνονται — απλώς χάνουν τη σύνδεση με την ψεύτικη παραγγελία.",
        en:"Today the app holds 8 fake customers with fake quotations, orders and sheets. «Add» places yours NEXT to them. «Replace» removes them together with their transactions, leaving only the real ones. Production orders and slabs are not deleted — they just lose the link to the fake order."},
  steps:{el:["«Προσθήκη και ενημέρωση»: τα δοκιμαστικά μένουν. Αν ένας κωδικός έχει ξαναμπεί, ενημερώνονται τα στοιχεία του αντί να γίνει δεύτερη καρτέλα. Καλή για πρώτη δοκιμή.",
             "«Αντικατάσταση των δοκιμαστικών»: διαβάστε το κείμενο δίπλα. Για πελάτες γράφει: «Φεύγουν οι 8 ψεύτικοι πελάτες και οι κινήσεις τους: 5 παραγγελίες, 5 προσφορές, 7 παραστατικά, 8 δελτία».",
             "Με την αντικατάσταση φεύγουν και τυχόν πελάτες που είχαν μπει από προηγούμενη εισαγωγή — μένει μόνο το τρέχον αρχείο.",
             "Για προμηθευτές, η αντικατάσταση βγάζει τους 6 ψεύτικους μαζί με τις αγορές τους και τα είδη του καταλόγου τους· αναλώσιμα, προϊόντα και τιμοκατάλογοι αγοράς μένουν, χωρίς προμηθευτή.",
             "Για είδη: μόνο προσθήκη. Τα 12 δικά μας προϊόντα συνδέονται με δελτία, προσφορές και πλάκες — η αντικατάστασή τους θα οριστεί όταν δούμε τα πραγματικά σας είδη.",
             "Πατήστε «Εισαγωγή Ν εγγραφών». Με αντικατάσταση, εμφανίζεται ερώτηση επιβεβαίωσης — πατήστε «OK».",
             "Αν αλλάξατε γνώμη, «Ακύρωση»: το αρχείο κλείνει και δεν αλλάζει τίποτα."],
         en:["«Add and update»: the sample data stays. If a code was imported before, its details are updated instead of creating a second card. Good for a first try.",
             "«Replace the sample data»: read the text beside it. For customers it says: «The 8 fake customers go, with their transactions: 5 orders, 5 quotations, 7 documents, 8 sheets».",
             "Replacing also removes any customers from a previous import — only the current file remains.",
             "For suppliers, replacing removes the 6 fake ones with their purchases and catalogue items; consumables, products and purchase price lists remain, without a supplier.",
             "For items: add only. Our 12 products are linked to sheets, quotations and slabs — replacing them will be defined once we see your real items.",
             "Click «Import N records». With replace, a confirmation question appears — click «OK».",
             "If you change your mind, «Cancel»: the file closes and nothing changes."]},
  res:{el:"Οι εγγραφές μπήκαν. Αν δεν χωράνε στον χώρο του browser, η εισαγωγή ακυρώνεται ΟΛΟΚΛΗΡΗ και σας το λέει — δεν μένει ποτέ μισή.",
       en:"The records are in. If they do not fit in the browser's storage, the import is cancelled ENTIRELY and you are told — it never stays half-done."},
  go:"mniGo('customers')"});

G({ic:"⑦", t:{el:"Βήμα 7 — Μετά την εισαγωγή", en:"Step 7 — After the import"},
  pic:MP.done, picCap:{el:"Το banner αλλάζει, και οι πελάτες σας εμφανίζονται στη λίστα με κωδικό CL- και προέλευση «Εισαγωγή».",
                       en:"The banner changes, and your customers appear in the list with a CL- code and source «Import»."},
  see:{el:"Πράσινο πλαίσιο «Έγινε.» με τα νούμερα και κουμπί «Άνοιγμα: Πελάτες». Το κίτρινο banner στην κορυφή κάθε οθόνης γράφει πλέον ότι υπάρχουν πραγματικά δεδομένα από εισαγωγή.",
       en:"A green «Done.» box with the numbers and an «Open: Customers» button. The yellow banner at the top of every screen now says there is real data from an import."},
  does:{el:"Οι πελάτες σας είναι πλέον κανονικές καρτέλες: ανοίγουν, διορθώνονται, μπαίνουν σε δελτία και προσφορές. Ό,τι δεν υπήρχε στο αρχείο (κατηγορία Α/Β/Γ, τιμοκατάλογος, τζίρος) παίρνει ουδέτερη τιμή μέχρι να το συμπληρώσετε.",
        en:"Your customers are now ordinary cards: they open, can be edited, and go into sheets and quotations. Anything missing from the file (A/B/C grade, price list, turnover) takes a neutral value until you fill it in."},
  steps:{el:["Πατήστε «Άνοιγμα: Πελάτες». Η λίστα δείχνει τους πελάτες σας.",
             "Ο κωδικός τους ξεκινά με «CL-» και συνεχίζει με τον κωδικό του προγράμματός σας (π.χ. CL-ΔΟΚ-001). Προμηθευτές: «SL-». Προϊόντα: «PX-».",
             "Στη στήλη «Προέλευση» γράφει «Εισαγωγή». Φίλτρο «Προέλευση: Εισαγωγή» τους δείχνει μόνους τους.",
             "Με χιλιάδες πελάτες η λίστα δείχνει τους πρώτους 150, με κουμπιά «Περισσότερες» και «Όλες». Η αναζήτηση ψάχνει πάντα σε όλους.",
             "Αν το αρχείο είχε «Επωνυμία πωλητή» και «Ημ/νία καταχώρησης», μπαίνουν στον «Υπεύθυνο πωλητή» και στην «Πρώτη επαφή» της καρτέλας.",
             "Ανοίξτε έναν: η καρτέλα έχει όσα στοιχεία είχε το αρχείο, και στο «Ιστορικό» μια εγγραφή «Εισαγωγή — Από [όνομα αρχείου]».",
             "Διορθώστε ό,τι χρειάζεται με «✎ Επεξεργασία» — π.χ. το ΑΦΜ με την κόκκινη ένδειξη — και «✓ Αποθήκευση». Η αλλαγή σας ΔΕΝ χάνεται αν αργότερα ξαναφέρετε το ίδιο αρχείο· ενημερώνονται μόνο τα πεδία που έχει το αρχείο.",
             "Φέρνοντας ξανά το ίδιο αρχείο με «Προσθήκη», ο δείκτης γράφει «0 νέες · 67 ενημερώσεις» — δεν διπλασιάζεται τίποτα.",
             "Γυρίζοντας στην «Εισαγωγή δεδομένων», το αρχείο έχει κλείσει μόνο του — δεν γίνεται κατά λάθος δεύτερη εισαγωγή."],
         en:["Click «Open: Customers». The list shows your customers.",
             "Their code starts with «CL-» followed by your software's code (e.g. CL-ΔΟΚ-001). Suppliers: «SL-». Products: «PX-».",
             "The «Source» column reads «Import». The «Source: Import» filter shows them on their own.",
             "With thousands of customers the list shows the first 150, with «More» and «All» buttons. Search always looks through all of them.",
             "If the file had «Salesperson» and «Registration date», they go into the card's «Sales owner» and «First contact».",
             "Open one: the card holds whatever the file had, and its «History» has an entry «Import — From [file name]».",
             "Fix what is needed with «✎ Edit» — e.g. the VAT number with the red tag — then «✓ Save». Your change is NOT lost if you later bring the same file again; only the fields in the file are updated.",
             "Bringing the same file again with «Add», the indicator reads «0 new · 67 updates» — nothing is duplicated.",
             "Back on «Data import», the file has closed by itself — no accidental second import."]},
  res:{el:"Η εφαρμογή δουλεύει με τους δικούς σας πελάτες.",
       en:"The app works with your own customers."},
  go:"goSec('crm','Πελάτες')"});

G({ic:"⑧", t:{el:"Βήμα 8 — Είδη αποθήκης: από κωδικούς σε προϊόντα", en:"Step 8 — Stock items: from codes to products"},
  pic:MP.items, picCap:{el:"Ο κωδικός «021.0.002» → υλικό 021 (ΔΕΜΑΤΙΟΥ). Η περιγραφή «0,02 ΣΕ Μ2» → πλάκα 2 cm, m².",
                        en:"Code «021.0.002» → material 021 (ΔΕΜΑΤΙΟΥ). Description «0,02 ΣΕ Μ2» → 2 cm slab, m²."},
  see:{el:"Ίδια οθόνη με τους πελάτες, με το κουμπί «Είδη αποθήκης» επιλεγμένο. Στο «Τι θα μπει» υπάρχει δείκτης «Προϊόντα»· στο «Πώς μπαίνουν» η επιλογή «Ομαδοποίηση σε προϊόντα» και ο διακόπτης «Χωρίς λογιστικά έξοδα και υπηρεσίες».",
       en:"The same screen as customers, with «Stock items» selected. «What will be imported» shows a «Products» indicator; «How they go in» offers «Group into products» and the «Without accounting expenses and services» switch."},
  does:{el:"Στην εφαρμογή ένα προϊόν (π.χ. ΔΕΜΑΤΙΟΥ) έχει πολλές παραλλαγές — πάχος, μορφή, μονάδα. Το πρόγραμμά σας κρατάει κάθε παραλλαγή ως ξεχωριστό είδος, με κωδικό όπως «021.0.002»: το πρώτο κομμάτι είναι το υλικό. Η εισαγωγή τα ξαναμαζεύει σε προϊόντα και διαβάζει πάχος και μονάδα από την περιγραφή.",
        en:"In the app one product (e.g. ΔΕΜΑΤΙΟΥ) has many variants — thickness, form, unit. Your software keeps each variant as a separate item, with a code like «021.0.002»: the first part is the material. The import regroups them into products and reads thickness and unit from the description."},
  steps:{el:["Πατήστε «Είδη αποθήκης» και φέρτε το αρχείο (π.χ. «ΠΡΟΙΟΝΤΑ.xls»).",
             "Στο «Ποια στήλη είναι τι» ελέγξτε: «Κωδικός» → Κωδικός είδους, «Περιγραφή» → Περιγραφή, «Λογ. χαρ/μός» → Λογιστικός χαρακτηρισμός.",
             "«Ομαδοποίηση σε προϊόντα» — «Αυτόματα»: αν οι κωδικοί έχουν τελείες (021.0.002), ομαδοποιεί από το πρώτο κομμάτι του κωδικού· αλλιώς από τη στήλη «Ομάδα». Από κάτω γράφει τι επέλεξε και πόσα προϊόντα βγαίνουν.",
             "Στη δική σας λίστα η στήλη «Ομάδα» γράφει Προϊόν / Εμπόρευμα — δεν είναι υλικό, γι' αυτό η αυτόματη επιλογή είναι ο κωδικός.",
             "Στην προεπισκόπηση, η στήλη «→ Προϊόν» δείχνει σε ποιο προϊόν πάει κάθε είδος, και η «Μορφή» τι διάβασε: «Πλάκα 2 cm», «Τρέχον μέτρο · 3 cm», «Όγκος», «Χύμα (τόνοι)», «Τεμάχιο».",
             "Μονάδες από την περιγραφή: «ΣΕ Μ2» → m², «ΣΕ ΜΜ» → μ.μ., «ΣΕ Μ3» → m³, «ΣΕ ΤΟΝΝΟΥΣ» → τόνοι, «ΣΕ ΤΕΜ» → τεμ. Πάχος: «0,02» → 2 cm· «0,04 & ΑΝΩ» → 4+ cm.",
             "«Χωρίς λογιστικά έξοδα και υπηρεσίες»: αναμμένο. Αφήνει έξω είδη που είναι έξοδα (ΧΔΕΦ) ή υπηρεσίες — δεν είναι μάρμαρα προς πώληση.",
             "Εισαγωγή. Διαχείριση → Προϊόντα: τα νέα προϊόντα έχουν κωδικό «PX-» (π.χ. PX-021) και μέσα τους τα είδη ως SKU με τον δικό σας κωδικό.",
             "Χωρίς δικό σας αρχείο: «Δοκιμαστικό αρχείο» — 60 είδη σε 3 ομάδες, 6 ανενεργά → 54 SKU σε 3 προϊόντα (εκεί οι κωδικοί δεν έχουν τελείες, οπότε ομαδοποιεί από τη στήλη «Ομάδα»).",
             "Αν η λίστα δεν έχει τιμές, τα SKU μπαίνουν με τιμή 0. Τεχνικά χαρακτηριστικά (πυκνότητα, αντοχές) δεν έρχονται ποτέ από το πρόγραμμα — συμπληρώνονται στο προϊόν → «Τεχνικά».",
             "Τα 12 δοκιμαστικά προϊόντα μένουν. Όπου υπάρχει και πραγματικό (π.χ. ΔΕΜΑΤΙΟΥ), θα φαίνονται και τα δύο μέχρι να οριστεί η αντικατάσταση."],
         en:["Click «Stock items» and bring the file (e.g. «ΠΡΟΙΟΝΤΑ.xls»).",
             "Under «Which column is what» check: «Code» → Item code, «Description» → Description, «Acct. type» → Accounting classification.",
             "«Group into products» — «Automatic»: if the codes contain dots (021.0.002), it groups by the first part of the code; otherwise by the «Group» column. Below, it states what it chose and how many products result.",
             "In your list the «Group» column says Product / Merchandise — it is not a material, which is why the automatic choice is the code.",
             "In the preview, the «→ Product» column shows which product each item joins, and «Form» what was read: «Slab 2 cm», «Running metre · 3 cm», «Block», «Bulk (tonnes)», «Piece».",
             "Units from the description: «ΣΕ Μ2» → m², «ΣΕ ΜΜ» → running metres, «ΣΕ Μ3» → m³, «ΣΕ ΤΟΝΝΟΥΣ» → tonnes, «ΣΕ ΤΕΜ» → pieces. Thickness: «0,02» → 2 cm; «0,04 & ΑΝΩ» → 4+ cm.",
             "«Without accounting expenses and services»: on. It leaves out items that are expenses or services — they are not stone for sale.",
             "Import. Admin → Products: the new products carry a «PX-» code (e.g. PX-021) and hold the items as SKUs with your own code.",
             "Without a file of your own: «Sample file» — 60 items in 3 groups, 6 inactive → 54 SKUs in 3 products (there the codes have no dots, so it groups by the «Group» column).",
             "If the list has no prices, SKUs come in at price 0. Technical data (density, strengths) never comes from the software — fill it in on the product → «Technical».",
             "The 12 sample products stay. Where a real one also exists (e.g. ΔΕΜΑΤΙΟΥ), both will show until replacement is defined."]},
  res:{el:"Τα είδη σας είναι διαθέσιμα σε δελτία και προσφορές, ομαδοποιημένα ανά υλικό, με πάχος και μονάδα.",
       en:"Your items are available in sheets and quotations, grouped by material, with thickness and unit."},
  go:"mniGo('products')"});

G({ic:"⑨", t:{el:"Βήμα 9 — Ιστορικό και επαναφορά", en:"Step 9 — History and restore"},
  pic:MP.hist, picCap:{el:"Κάθε εισαγωγή και κάθε επαναφορά καταγράφεται. Το κουμπί επαναφοράς εμφανίζεται μόνο όταν υπάρχει κάτι να επανέλθει.",
                       en:"Every import and every restore is logged. The restore button appears only when there is something to restore."},
  see:{el:"Στο κάτω μέρος της οθόνης: πίνακας «Ιστορικό εισαγωγών» (πότε, τι, αρχείο, νέες, ενημερώσεις, τρόπος) και κουμπιά «Επαναφορά: Πελάτες», «Επαναφορά: Προμηθευτές», «Επαναφορά: Είδη αποθήκης».",
       en:"At the bottom of the screen: the «Import history» table (when, what, file, new, updates, mode) and the buttons «Restore: Customers», «Restore: Suppliers», «Restore: Stock items»."},
  does:{el:"Γυρίζει την εφαρμογή στην κατάσταση πριν από τις εισαγωγές, για ένα είδος τη φορά. Βγάζει ό,τι μπήκε από αρχείο και επαναφέρει τα δοκιμαστικά μαζί με όλες τις συνδέσεις τους — παραγγελίες, δελτία, τιμοκαταλόγους, εντολές παραγωγής.",
        en:"It returns the app to its state before the imports, one kind at a time. It removes whatever came from a file and restores the sample data with all its links — orders, sheets, price lists, production orders."},
  steps:{el:["Κατεβείτε στο «Ιστορικό εισαγωγών». Κάθε γραμμή είναι μία εισαγωγή· η πορτοκαλί ένδειξη «αντικατάσταση» δείχνει ποιες έβγαλαν δοκιμαστικά.",
             "Πατήστε «Επαναφορά: Πελάτες».",
             "Η ερώτηση λέει πόσοι εισαγμένοι θα αφαιρεθούν. Πατήστε «OK».",
             "Επιστρέφουν οι 8 δοκιμαστικοί πελάτες, οι 5 παραγγελίες, οι 5 προσφορές και τα 8 δελτία. Οι εντολές παραγωγής ξαναβρίσκουν την παραγγελία τους.",
             "Το banner ξαναγράφει «Δοκιμαστικά δεδομένα».",
             "Στο ιστορικό μπαίνει γραμμή «Επαναφορά — αφαιρέθηκαν Ν».",
             "Προσοχή: το εισαγμένο αρχείο ΔΕΝ ξαναέρχεται με την επαναφορά. Για να τους ξαναφέρετε, κάνετε νέα εισαγωγή."],
         en:["Scroll to «Import history». Each row is one import; the orange «replace» tag shows which ones removed sample data.",
             "Click «Restore: Customers».",
             "The question states how many imported records will be removed. Click «OK».",
             "The 8 sample customers, 5 orders, 5 quotations and 8 sheets come back. Production orders find their order again.",
             "The banner reads «Sample data» again.",
             "A «Restore — removed N» row is added to the history.",
             "Careful: the imported file does NOT come back with a restore. To bring them in again, run a new import."]},
  res:{el:"Η εφαρμογή είναι όπως πριν. Μπορείτε να δοκιμάσετε όσες φορές θέλετε χωρίς φόβο.",
       en:"The app is as it was. You can try as many times as you like without fear."},
  go:"mniGo('customers')"});

G({ic:"⑩", t:{el:"Βήμα 10 — Πού μένουν τα δεδομένα", en:"Step 10 — Where the data lives"},
  pic:MP.store, picCap:{el:"Τα δεδομένα μένουν στον browser αυτού του υπολογιστή. Δεν ανεβαίνουν σε καμία ιστοσελίδα.",
                        en:"The data stays in this computer's browser. It is not uploaded to any website."},
  see:{el:"Πάνω στην οθόνη, ο δείκτης «Τοπικός χώρος» δείχνει πόσα MB πιάνουν τα δεδομένα από τα περίπου 5 MB που δίνει ο browser.",
       en:"At the top of the screen, the «Local storage» indicator shows how many MB the data takes out of the roughly 5 MB the browser allows."},
  does:{el:"Η εφαρμογή είναι δημόσια στο internet, αλλά οι πελάτες σας ΔΕΝ είναι. Μένουν αποθηκευμένοι μόνο στον browser όπου κάνατε την εισαγωγή. Αυτό προστατεύει τα στοιχεία τρίτων (GDPR) — έχει όμως τέσσερις συνέπειες που πρέπει να ξέρετε.",
        en:"The app is public on the internet, but your customers are NOT. They are stored only in the browser where you ran the import. This protects third-party data (GDPR) — but it has four consequences you need to know."},
  steps:{el:["Άλλος υπολογιστής, κινητό ή άλλος browser (Chrome / Edge) ΔΕΝ βλέπει τους πελάτες σας. Εκεί χρειάζεται νέα εισαγωγή.",
             "Το κουμπί ↺ στην πάνω μπάρα («Επαναφορά όλων των δοκιμαστικών») σβήνει ΚΑΙ τα εισαγμένα. Για ένα είδος μόνο, χρησιμοποιήστε την «Επαναφορά» του Βήματος 9.",
             "Αν καθαρίσετε το ιστορικό / τα δεδομένα του browser, χάνονται. Κρατήστε το αρχείο της εξαγωγής — είναι το αντίγραφο ασφαλείας σας.",
             "Αν ο δείκτης «Τοπικός χώρος» πλησιάσει το 80% (γίνεται κόκκινος), κρατήστε «Μόνο ενεργοί» ή αφαιρέστε φωτογραφίες προϊόντων. Αν κάτι δεν χωράει, η εισαγωγή ακυρώνεται χωρίς να χαλάσει τίποτα.",
             "Στο πραγματικό σύστημα (Φάση 4) τα δεδομένα θα ζουν σε ασφαλή βάση δεδομένων με πρόσβαση ανά χρήστη — ο περιορισμός αυτός αφορά μόνο το mockup."],
         en:["Another computer, phone or browser (Chrome / Edge) does NOT see your customers. It needs its own import.",
             "The ↺ button in the top bar («Restore all sample data») ALSO erases imported data. For a single kind, use the «Restore» of Step 9.",
             "If you clear the browser's history / data, they are lost. Keep the export file — it is your backup.",
             "If the «Local storage» indicator nears 80% (it turns red), keep «Active only» or remove product photos. If something does not fit, the import is cancelled without breaking anything.",
             "In the real system (Phase 4) the data will live in a secure database with per-user access — this limit applies to the mockup only."]},
  res:{el:"Ξέρετε ότι τα στοιχεία των πελατών σας δεν είναι δημόσια, και πώς να μην τα χάσετε.",
       en:"You know your customers' details are not public, and how not to lose them."}});

G({ic:"⑪", t:{el:"Βήμα 11 — Όταν κάτι δεν πάει καλά", en:"Step 11 — When something goes wrong"},
  pic:MP.bad, picCap:{el:"Κόκκινο πλαίσιο: το αρχείο δεν μπήκε και τίποτα δεν άλλαξε. Το κείμενο λέει τι να κάνετε.",
                      en:"Red box: the file was not imported and nothing changed. The text says what to do."},
  see:{el:"Κόκκινο πλαίσιο «Το αρχείο δεν μπορεί να μπει» κάτω από την επιλογή αρχείου, με την αιτία.",
       en:"A red «The file cannot be imported» box below the file picker, with the reason."},
  does:{el:"Κάθε πρόβλημα σταματάει ΠΡΙΝ αλλάξει οτιδήποτε. Τα δοκιμαστικά δεν σβήνονται ποτέ εξαιτίας λάθος αρχείου.",
        en:"Every problem stops BEFORE anything changes. The sample data is never erased because of a wrong file."},
  steps:{el:["«Το αρχείο έχει μόνο τον εσωτερικό κωδικό κάθε εγγραφής»: η εξαγωγή έγινε χωρίς στήλες (ό,τι έγινε στις 09/09). Γυρίστε στο Βήμα 2. Δοκιμάστε το με το κουμπί «Αρχείο χωρίς στήλες».",
             "«Πολύ παλιά μορφή Excel (95 ή παλιότερη)» ή «Το αρχείο .xls φαίνεται κατεστραμμένο»: ανοίξτε το στο Excel και αποθηκεύστε ως .xlsx. (Το κανονικό .xls 97–2003 διαβάζεται κατευθείαν.)",
             "«Δεν βρέθηκε γραμμή επικεφαλίδων»: το αρχείο δεν έχει ονόματα στηλών. Ξαναβγάλτε το με επικεφαλίδες.",
             "«Αντιστοιχίστε τη στήλη που έχει την Επωνυμία»: στο Βήμα 4 διαλέξτε ποια στήλη είναι η επωνυμία.",
             "«Δεν χώρεσε — τίποτα δεν άλλαξε»: τα δεδομένα ξεπερνούν τον χώρο του browser. Ανάψτε «Μόνο ενεργοί» ή αφαιρέστε φωτογραφίες.",
             "«Ο browser δεν ανοίγει αρχεία Excel»: πολύ παλιός browser. Ενημερώστε Chrome / Edge / Firefox ή αποθηκεύστε το αρχείο ως CSV.",
             "Ελληνικά που φαίνονται σαν «ÅðùíõìÝá»: σπάνιο — στείλτε μας το αρχείο. (Τα CSV σε κωδικοποίηση Windows-1253 διαβάζονται ήδη αυτόματα.)",
             "Οποιοδήποτε άλλο μήνυμα: κάντε μια φωτογραφία της οθόνης και στείλτε την μαζί με το αρχείο."],
         en:["«The file holds only the internal code of each record»: the export ran without columns (what happened on 09/09). Go back to Step 2. Try it with the «File without columns» button.",
             "«Very old Excel format (95 or older)» or «The .xls file seems damaged»: open it in Excel and save as .xlsx. (Ordinary .xls 97–2003 is read directly.)",
             "«No heading row found»: the file has no column names. Export it again with headings.",
             "«Match the column that holds the Name»: in Step 4 choose which column is the name.",
             "«Did not fit — nothing changed»: the data exceeds the browser's storage. Switch on «Active only» or remove photos.",
             "«This browser cannot open Excel files»: a very old browser. Update Chrome / Edge / Firefox or save the file as CSV.",
             "Greek showing as «ÅðùíõìÝá»: rare — send us the file. (CSV files in Windows-1253 encoding are already read automatically.)",
             "Any other message: take a screenshot and send it with the file."]},
  res:{el:"Ξέρετε τι σημαίνει κάθε μήνυμα και τι να κάνετε — χωρίς ρίσκο για τα δεδομένα.",
       en:"You know what each message means and what to do — with no risk to the data."},
  go:"mniGo('customers')"});

/* σενάριο δοκιμής — με τα ενσωματωμένα δοκιμαστικά αρχεία */
if(GUIDE.test && GUIDE.test.cards){
  GUIDE.test.cards.push({ic:"⤓", t:{el:"Δοκιμή — Εισαγωγή πελατολογίου χωρίς δικό σας αρχείο", en:"Test — Customer import without a file of your own"},
    see:{el:"Δέκα λεπτά. Χρησιμοποιεί το «Δοκιμαστικό αρχείο» της εφαρμογής, με γνωστά νούμερα, ώστε να συγκρίνετε με όσα γράφονται εδώ.",
         en:"Ten minutes. It uses the app's own «Sample file», with known numbers, so you can compare against what is written here."},
    does:{el:"Περνάει από όλη τη διαδρομή: αρχείο → αντιστοίχιση → έλεγχοι → αντικατάσταση → καρτέλα → επανάληψη → επαναφορά → λάθος αρχείο.",
          en:"It walks the whole path: file → matching → checks → replace → card → repeat → restore → wrong file."},
    steps:{el:["Διαχείριση → Εισαγωγή δεδομένων → «Πελάτες» → «Δοκιμαστικό αρχείο».",
               "Ελέγξτε: «δοκιμαστικό-πελάτες.csv · CSV / κείμενο · 82 γραμμές».",
               "Στο «Ποια στήλη είναι τι» όλες οι 12 στήλες έχουν πεδίο — καμία αχνή.",
               "Στο «Τι θα μπει»: Γραμμές αρχείου 82 · Θα μπουν 67 · Παραλείπονται 15 (3 χωρίς όνομα · 2 διπλές · 10 ανενεργές) · Προς έλεγχο 5 (2 ΑΦΜ · 3 email).",
               "Στον πίνακα προεπισκόπησης, ο ΔΟΚ-005 έχει κόκκινο «έλεγχος» στο ΑΦΜ.",
               "Σβήστε το «Μόνο ενεργοί»: το «Θα μπουν» γίνεται 77. Ανάψτε το ξανά: 67.",
               "Διαλέξτε «Αντικατάσταση των δοκιμαστικών». Το κείμενο γράφει «Φεύγουν οι 8 ψεύτικοι πελάτες».",
               "«Εισαγωγή 67 εγγραφών» → «OK». Πράσινο «Έγινε. 67 νέες…».",
               "Το banner πάνω γράφει «πραγματικά δεδομένα από εισαγωγή».",
               "«Άνοιγμα: Πελάτες»: ο δείκτης γράφει 67 πελάτες. Πωλήσεις → Παραγγελίες: καμία (οι ψεύτικες έφυγαν).",
               "Ανοίξτε τον «ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 005» → «✎ Επεξεργασία» → «Κατηγορία»: A → «✓ Αποθήκευση».",
               "Ξανά «Εισαγωγή δεδομένων» → «Δοκιμαστικό αρχείο» → «Προσθήκη και ενημέρωση»: γράφει «0 νέες · 67 ενημερώσεις». Εισαγωγή. Ο πελάτης 005 κρατάει την κατηγορία A.",
               "Κάτω, «Επαναφορά: Πελάτες» → «OK». Πωλήσεις → Πελάτες: ξανά 8. Παραγγελίες: ξανά 5.",
               "Τέλος, «Αρχείο χωρίς στήλες»: κόκκινο πλαίσιο «μόνο τον εσωτερικό κωδικό… 40 εγγραφές». Οι πελάτες παραμένουν 8."],
           en:["Admin → Data import → «Customers» → «Sample file».",
               "Check: «δοκιμαστικό-πελάτες.csv · CSV / text · 82 rows».",
               "Under «Which column is what» all 12 columns have a field — none faded.",
               "Under «What will be imported»: File rows 82 · Will import 67 · Skipped 15 (3 no name · 2 duplicates · 10 inactive) · To check 5 (2 VAT · 3 email).",
               "In the preview table, ΔΟΚ-005 shows a red «check» on the VAT number.",
               "Switch off «Active only»: «Will import» becomes 77. Switch it back on: 67.",
               "Choose «Replace the sample data». The text reads «The 8 fake customers go».",
               "«Import 67 records» → «OK». Green «Done. 67 new…».",
               "The banner at the top reads «real data from an import».",
               "«Open: Customers»: the indicator shows 67 customers. Sales → Orders: none (the fake ones are gone).",
               "Open «ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 005» → «✎ Edit» → «Category»: A → «✓ Save».",
               "Back to «Data import» → «Sample file» → «Add and update»: it reads «0 new · 67 updates». Import. Customer 005 keeps grade A.",
               "Below, «Restore: Customers» → «OK». Sales → Customers: 8 again. Orders: 5 again.",
               "Finally, «File without columns»: red box «only the internal code… 40 records». Customers stay at 8."]},
    res:{el:"Αν όλα τα νούμερα ταιριάζουν, η εισαγωγή είναι έτοιμη για το πραγματικό σας αρχείο.",
         en:"If every number matches, the import is ready for your real file."},
    go:"mniGo('customers')"});
}

/* γλωσσάριο */
if(GUIDE.glossary) GUIDE.glossary.push(
  {w:{el:"Εισαγωγή δεδομένων", en:"Data import"},
   d:{el:"Μεταφορά πελατών, προμηθευτών ή ειδών από το εμπορικό σας πρόγραμμα με ένα αρχείο (Excel, CSV, JSON, XML). Τα δεδομένα μένουν μόνο στον browser όπου έγινε η εισαγωγή.",
      en:"Bringing customers, suppliers or items from your business software with one file (Excel, CSV, JSON, XML). The data stays only in the browser where the import was done."}},
  {w:{el:"Αντιστοίχιση στηλών", en:"Column matching"},
   d:{el:"Ποια στήλη του αρχείου μπαίνει σε ποιο πεδίο της εφαρμογής. Γίνεται αυτόματα από τα ονόματα των στηλών· ό,τι διορθώσετε το θυμάται.",
      en:"Which file column goes into which app field. Done automatically from the column names; whatever you correct is remembered."}},
  {w:{el:"Αντικατάσταση δοκιμαστικών", en:"Replacing sample data"},
   d:{el:"Τρόπος εισαγωγής που βγάζει τους ψεύτικους πελάτες ή προμηθευτές μαζί με τις ψεύτικες κινήσεις τους, ώστε να μείνουν μόνο οι πραγματικοί. Αναιρείται με «Επαναφορά».",
      en:"An import mode that removes the fake customers or suppliers with their fake transactions, so only real ones remain. Undone with «Restore»."}},
  {w:{el:"Ομαδοποίηση από τον κωδικό", en:"Grouping by code"},
   d:{el:"Στα είδη με κωδικό όπως «021.0.002», το πρώτο κομμάτι («021») είναι το υλικό. Όλα τα είδη με το ίδιο πρώτο κομμάτι γίνονται ένα προϊόν με πολλά SKU.",
      en:"For items coded like «021.0.002», the first part («021») is the material. All items sharing that first part become one product with many SKUs."}},
  {w:{el:"Ψηφίο ελέγχου ΑΦΜ", en:"VAT check digit"},
   d:{el:"Το τελευταίο ψηφίο του ΑΦΜ προκύπτει από τα οκτώ πρώτα. Αν δεν ταιριάζει, το ΑΦΜ έχει γραφτεί λάθος — η εφαρμογή το σημαδεύει «έλεγχος».",
      en:"The last digit of a Greek VAT number is derived from the first eight. If it does not match, the number was mistyped — the app flags it «check»."}}
);

/* η κάρτα της Διαχείρισης παραπέμπει στον πλήρη οδηγό */
if(GUIDE.admin && GUIDE.admin.cards){
  GUIDE.admin.cards.push({ic:"⤓",
    t:{el:"Εισαγωγή πελατών, προμηθευτών και ειδών", en:"Importing customers, suppliers and items"},
    see:{el:"Διαχείριση → Εισαγωγή δεδομένων. Τρία κουμπιά (Πελάτες, Προμηθευτές, Είδη αποθήκης) και επιλογή αρχείου. Το ίδιο κουμπί υπάρχει και δίπλα στο «+ Νέος» κάθε λίστας.",
         en:"Admin → Data import. Three buttons (Customers, Suppliers, Stock items) and a file picker. The same button also sits next to «+ New» on each list."},
    does:{el:"Διαβάζει το αρχείο από το πρόγραμμά σας, βρίσκει μόνη της ποια στήλη είναι η επωνυμία, το ΑΦΜ, η πόλη, και σας δείχνει τι θα μπει πριν μπει. Τα δεδομένα μένουν μόνο σε αυτόν τον υπολογιστή.",
          en:"It reads the export from your current software, works out which column is the name, VAT number and city, and shows you what will be imported before it happens. The data stays on this computer only."},
    steps:{el:["Ο πλήρης οδηγός, σε 11 βήματα με εικόνες, είναι στην καρτέλα «Εισαγωγή δεδομένων» αυτού του οδηγού.",
               "Για γρήγορη δοκιμή: «Πελάτες» → «Δοκιμαστικό αρχείο» → «Εισαγωγή».",
               "Για επαναφορά: «Επαναφορά: Πελάτες» στο κάτω μέρος της οθόνης."],
           en:["The full guide, in 11 illustrated steps, is on this guide's «Data import» tab.",
               "For a quick try: «Customers» → «Sample file» → «Import».",
               "To undo: «Restore: Customers» at the bottom of the screen."]},
    res:{el:"Η καρτέλα πελατών δείχνει τους δικούς σας πελάτες. Αν το αρχείο δεν έχει στήλες (μόνο κωδικούς), η εφαρμογή το λέει καθαρά αντί να σβήσει τα δοκιμαστικά.",
         en:"The customer list shows your own customers. If the file has no columns (codes only), the app says so plainly instead of wiping the sample data."},
    go:"openGuide('imp')"});
}

/* καρτέλα στον οδηγό, μετά το «Δελτίο παραγγελίας» */
var _mniRenderGuide = renderGuide;
renderGuide = function(){
  _mniRenderGuide();
  var body = document.getElementById("gdBody"); if(!body) return;
  var nav = body.querySelector(".gd-nav"); if(!nav) return;
  var b = document.createElement("button");
  if(GTAB === "imp") b.className = "on";
  b.setAttribute("onclick", "setGTab('imp')");
  b.textContent = "⤓ " + (GLANG === "el" ? "Εισαγωγή δεδομένων" : "Data import");
  var after = nav.querySelector("button[onclick*=\"'sheet'\"]");
  if(after && after.nextSibling) nav.insertBefore(b, after.nextSibling); else nav.appendChild(b);
  if(GTAB === "imp"){
    nav.insertAdjacentHTML("afterend",
      '<div class="card" style="margin-bottom:16px;padding:16px 18px;font-size:14.5px;line-height:1.65">'
      + (GLANG === "el"
        ? "<strong>Σε μία πρόταση:</strong> φέρνετε τους πελάτες, τους προμηθευτές και τα είδη σας από το πρόγραμμα που δουλεύετε σήμερα, βλέπετε τι θα μπει <strong>πριν</strong> μπει, και αν δεν σας αρέσει, το γυρίζετε πίσω με ένα κουμπί. Δεν έχετε ακόμα αρχείο; Κάθε βήμα δοκιμάζεται με το «Δοκιμαστικό αρχείο»."
        : "<strong>In one sentence:</strong> you bring in your customers, suppliers and items from the software you use today, see what will be imported <strong>before</strong> it happens, and undo it with one button if you do not like it. No file yet? Every step can be tried with the «Sample file».")
      + '</div>');
  }
};

/* κουμπιά δοκιμαστικού αρχείου + οδηγού μέσα στην οθόνη */
var _mniViewImport = viewImport;
viewImport = function(){
  var h = _mniViewImport();
  var anchor = '<p class="sub" style="margin-top:8px">Μορφές που διαβάζονται:';
  if(MNI.type && h.indexOf(anchor) >= 0){
    var extra = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">'
      + '<span style="font-size:13.5px;color:var(--muted)">Δεν έχετε ακόμα αρχείο;</span>'
      + '<button class="b ghost sm" onclick="mniDemo(\'' + MNI.type + '\')">Δοκιμαστικό αρχείο</button>'
      + '<button class="b ghost sm" onclick="mniDemo(\'bad\')">Αρχείο χωρίς στήλες</button>'
      + '<button class="b ghost sm" onclick="openGuide(\'imp\')">📖 Οδηγός βήμα-βήμα</button></div>';
    h = h.replace(anchor, extra + anchor);
  }
  return h;
};

/* Διόρθωση: σε επεξεργασία, ένα <select> χωρίς την τρέχουσα τιμή στις επιλογές
   έδειχνε την ΠΡΩΤΗ επιλογή — και η «Αποθήκευση» την έγραφε σιωπηλά.
   (π.χ. εισαγμένος πελάτης με κατηγορία «ΧΟΝΔΡΙΚΗ» γινόταν «Μαρμαράς / συνεργείο»).
   Η τρέχουσα τιμή μπαίνει πρώτη στη λίστα, ώστε να μένει όπως είναι. */
var _mniEf = ef;
ef = function(rec, path, label, type, opts, disp){
  if(type === "sel" && EDITING && Array.isArray(opts)){
    var v = getPath(rec, path);
    if(v != null && v !== "" && opts.map(String).indexOf(String(v)) < 0) opts = [v].concat(opts);
  }
  return _mniEf(rec, path, label, type, opts, disp);
};
/*MNI:END*/
