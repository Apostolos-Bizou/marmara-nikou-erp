/*MNI:BEGIN v2*/
/* ============================================================
   ΕΙΣΑΓΩΓΗ ΔΕΔΟΜΕΝΩΝ — ΠΕΛΑΤΕΣ · ΠΡΟΜΗΘΕΥΤΕΣ · ΕΙΔΗ  (Φ28 · οδηγός Φ28β)
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
            mode:"merge", activeOnly:true, result:null, caption:"" };

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
function mniVat(v){
  var s = mniStr(v).toUpperCase().replace(/\s|\./g,"").replace(/^(EL|GR)/,"");
  if(/^\d{8}$/.test(s)) s = "0" + s;      /* το Excel τρώει το αρχικό μηδέν */
  return s;
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
function mniUnit(v){
  var n = mniNorm(v);
  if(!n) return "";
  if(/^(τμ|μ2|m2|τ μ|sqm|τετραγωνικ)/.test(n)) return "m²";
  if(/^(μμ|μ μ|τρεχ|lm|m$|μετρ)/.test(n)) return "μ.μ.";
  if(/^(τεμ|τμχ|pcs|pc|τεμαχ)/.test(n)) return "τεμ.";
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
    read:function(){ return Promise.reject(mniErr(
      "Το αρχείο είναι στην παλιά μορφή Excel (.xls). Ανοίξτε το στο Excel και αποθηκεύστε το ως «Βιβλίο εργασίας Excel (.xlsx)» ή ως CSV.")); } },
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

/* ============================================================
   ΣΥΝΤΑΓΕΣ — τι πεδία δέχεται κάθε είδος και με ποια ονόματα
   ============================================================ */
function mniF(k,l,syn,o){ var f = {k:k, l:l, syn:syn}; for(var x in (o||{})) f[x] = o[x]; return f; }
var MNI_PARTY_FIELDS = function(who){ return [
  mniF("ext","Κωδικός στο πρόγραμμα",["κωδικός "+who,"κωδικός","κωδ","code","id","α/α"],{not:["ταχ","τ.κ","αφμ","δου","άρθρ","barcode"]}),
  mniF("name","Επωνυμία",["επωνυμία","ονοματεπώνυμο","ονομασία","επώνυμο",who,"name","company"],{req:true, not:["διακριτ"]}),
  mniF("brand","Διακριτικός τίτλος",["διακριτικός τίτλος","διακριτικός","τίτλος","brand"]),
  mniF("vat","ΑΦΜ",["αφμ","α.φ.μ","vat","tax id","tin"],{t:"vat"}),
  mniF("doy","ΔΟΥ",["δου","δ.ο.υ","εφορία","tax office"]),
  mniF("kad","Επάγγελμα",["επάγγελμα","δραστηριότητα","καδ","occupation"]),
  mniF("cat","Κατηγορία",["κατηγορία "+who,"κατηγορία","ομάδα","group","category"]),
  mniF("addr","Διεύθυνση",["διεύθυνση","οδός","address","street"]),
  mniF("zip","Τ.Κ.",["ταχυδρομικός κώδικας","τ.κ","τκ","ταχ. κωδ","zip","postal"]),
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
      mniF("ext","Κωδικός είδους",["κωδικός είδους","κωδικός","κωδ","sku","code","id"],{not:["barcode","ταχ","ομάδ"]}),
      mniF("name","Περιγραφή",["περιγραφή είδους","περιγραφή","ονομασία","είδος","name","description"],{req:true}),
      mniF("group","Ομάδα (γίνεται προϊόν)",["ομάδα είδους","ομάδα","κατηγορία","οικογένεια","group","category"]),
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
            upd:0, add:0, hasName:M.name !== undefined, hasStatus:M.status !== undefined };
  if(!P.hasName) return P;
  var seen = {}, existing = {};
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
            : mniStr(raw);
      if(v !== "" && v !== null) o[f.k] = v;
    });
    if(!o.name){ P.noName++; return; }
    if(P.hasStatus && o.status === false){ P.inactive++; if(MNI.activeOnly) return; }
    var dk = o.ext ? "e:" + o.ext : (o.vat && mniAfmOk(o.vat) && type !== "products") ? "v:" + o.vat : "n:" + mniNorm(o.name);
    if(seen[dk]){ P.dups++; return; }
    seen[dk] = 1;
    if(o.vat && /^\d+$/.test(o.vat) && !mniAfmOk(o.vat)) P.badVat++;
    if(o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) P.badMail++;
    if(MNI.mode === "merge" && o.ext && existing[o.ext]) P.upd++; else P.add++;
    P.recs.push(o);
  });
  return P;
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
function mniPartyRecord(type, o, file){
  var R = MNI_RECIPES[type], r = Object.create(MNI_PROTO[type]);
  r.id = mniUniqueId(R.coll, R.prefix + (o.ext ? String(o.ext).replace(/\s+/g, "") : mniSlug(o.name)));
  r.imp = 1;
  ["ext","name","brand","vat","doy","kad","cat","addr","zip","city","country","tel","mob","email","web",
   "payTerms","balance","credit","notes","iban"].forEach(function(k){ if(o[k] !== undefined) r[k] = o[k]; });
  if(!o.brand) r.brand = o.name;
  if(o.mob) r.wa = o.mob;
  if(o.status === false) r.status = type === "customers" ? "Ανενεργός" : "Ανενεργός";
  if(o.contact) r.contacts = [{n:o.contact, r:"Επαφή", m:o.mob || o.tel || "", e:o.email || "", bd:"", note:"", dept:""}];
  r.acts = [{d:mniToday(), t:"Εισαγωγή", txt:"Από " + file}];
  return r;
}
function mniMergeParty(r, o){
  ["name","brand","vat","doy","kad","cat","addr","zip","city","country","tel","mob","email","web",
   "payTerms","balance","credit","notes","iban"].forEach(function(k){ if(o[k] !== undefined) r[k] = o[k]; });
  if(o.status !== undefined && o.status !== null) r.status = o.status ? "Ενεργός" : "Ανενεργός";
}
function mniVariant(o, i){
  var v = { sku:String(o.ext || ("PX-" + (i + 1))).replace(/\s+/g, ""),
            form:o.form || "Είδος αποθήκης", th:o.th != null ? o.th : 0, fin:o.fin || "—",
            unit:mniUnit(o.unit) || "τεμ.", stock:o.stock != null ? o.stock : 0, loc:"—",
            base:o.price != null ? o.price : 0, name:o.name, imp:1 };
  if(o.cost != null) v.cost = o.cost;
  if(o.barcode) v.barcode = o.barcode;
  if(o.dims) v.dims = o.dims;
  if(o.vatRate != null) v.vatRate = o.vatRate;
  if(o.status === false) v.inactive = true;
  return v;
}
function mniImportProducts(P, file){
  var R = MNI_RECIPES.products, M = mniMapped(), grouped = M.group !== undefined;
  var skus = {}; allVariants().forEach(function(x){ skus[x.v.sku] = x; });
  var add = 0, upd = 0, prods = 0;
  P.recs.forEach(function(o, i){
    var v = mniVariant(o, i);
    var hit = skus[v.sku];
    if(hit && hit.v.imp){                      /* υπάρχει από προηγούμενη εισαγωγή */
      for(var k in v) hit.v[k] = v[k]; upd++; return;
    }
    if(hit) v.sku = v.sku + "-X";                /* σύγκρουση με δικό μας SKU */
    var pcode = R.prefix + (grouped && o.group ? mniSlug(o.group) : (o.ext ? v.sku : mniSlug(o.name) + "-" + (i + 1)));
    var p = find(DATA.products, "code", pcode);
    if(!p){
      p = Object.create(MNI_PROTO.products);
      p.code = pcode; p.imp = 1;
      p.name = grouped && o.group ? o.group : o.name;
      if(grouped && o.group) p.family = o.group;
      if(o.supplier) p.supplier = o.supplier;
      p.created = mniToday(); p.variants = [];
      p.notes = "Εισαγωγή από " + file;
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
    if(imp.demo && !confirm("Θα αφαιρεθούν " + imp.demo + " δοκιμαστικοί " + R.many
        + " μαζί με τις δοκιμαστικές κινήσεις τους. Επανέρχονται με «Επαναφορά». Συνέχεια;")) return;
  }
  var snapshot = JSON.stringify(DATA);
  var at = new Date().toISOString(), res = {type:type, file:MNI.file, fmt:MNI.fmt, at:at,
             rows:P.total, add:0, upd:0, skipped:P.noName + P.dups + (MNI.activeOnly ? P.inactive : 0),
             mode:replace ? "replace" : "merge"};
  DATA._imp = DATA._imp || {log:[], journal:{}};
  var J = DATA._imp.journal[type] = DATA._imp.journal[type] || {sets:[], tombs:[]};

  if(type === "products"){
    var pr = mniImportProducts(P, MNI.file);
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
      else { var r = mniPartyRecord(type, o, MNI.file); DATA[R.coll].push(r); if(o.ext) byExt[o.ext] = r; res.add++; }
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
    for(var i = 0; i < MNI.rows.length && smp.length < 3; i++){ var v = mniStr(MNI.rows[i][ci]); if(v) smp.push(v); }
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
  h += '<div class="grid">'
    + kpi("Γραμμές αρχείου", P.total.toLocaleString("el-GR"), "")
    + kpi("Θα μπουν", P.recs.length.toLocaleString("el-GR"), P.upd ? P.add + " νέες · " + P.upd + " ενημερώσεις" : "όλες νέες")
    + kpi("Παραλείπονται", (P.noName + P.dups + (MNI.activeOnly ? P.inactive : 0)).toLocaleString("el-GR"),
          P.noName + " χωρίς όνομα · " + P.dups + " διπλές" + (P.hasStatus ? " · " + P.inactive + " ανενεργές" : ""),
          (P.noName + P.dups) > 0)
    + (MNI.type !== "products" ? kpi("Προς έλεγχο", P.badVat + P.badMail,
          P.badVat + " ΑΦΜ · " + P.badMail + " email — μπαίνουν όπως είναι", (P.badVat + P.badMail) > 0) : "")
    + '</div>';
  if(P.hasStatus){
    h += '<label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px">'
      + '<input type="checkbox"' + (MNI.activeOnly ? ' checked' : '') + ' onchange="mniOpt(\'activeOnly\',this.checked)"> '
      + 'Μόνο ενεργοί (' + (P.inactive).toLocaleString("el-GR") + ' ανενεργές μένουν έξω)</label>';
  } else {
    h += '<p class="sub">Δεν υπάρχει στήλη «ενεργός/ανενεργός» — θα μπουν όλες οι εγγραφές.</p>';
  }
  /* προεπισκόπηση */
  var cols = MNI.type === "products"
    ? [["ext","Κωδικός"],["name","Περιγραφή"],["group","Ομάδα"],["unit","Μον."],["price","Τιμή"],["stock","Απόθεμα"]]
    : [["ext","Κωδικός"],["name","Επωνυμία"],["vat","ΑΦΜ"],["city","Πόλη"],["tel","Τηλέφωνο"],["email","Email"]];
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
    : MNI_BANNER;
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

MP.items = '<svg viewBox="0 0 700 150" xmlns="http://www.w3.org/2000/svg" ' + MP_F + '>' + MP_DEFS
+ '<rect width="700" height="150" fill="#FAF9F5"/>'
+ '<text x="20" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>ΣΤΟ ΠΡΟΓΡΑΜΜΑ ΣΑΣ: ΕΙΔΗ</text>'
+ ['ΕΙΔ-001 · ΓΚΡΙ 2cm ΓΥΑΛΙΣΤΟ','ΕΙΔ-004 · ΓΚΡΙ 3cm ΜΑΤ','ΕΙΔ-007 · ΓΚΡΙ 2cm ΓΥΑΛΙΣΤΟ','ΕΙΔ-002 · ΜΠΕΖ 3cm ΓΥΑΛΙΣΤΟ']
  .map(function(t, i){ return '<rect x="20" y="' + (32 + i * 26) + '" width="220" height="20" rx="3" fill="#fff" stroke="#ddd"/>'
    + '<text x="30" y="' + (46 + i * 26) + '" font-size="8.5">' + t + '</text>'; }).join("")
+ mpArrow(246, 78, 300, 78)
+ '<text x="258" y="68" font-size="7.5" fill="#D81B8C" font-weight="700">ομάδα</text>'
+ '<text x="310" y="22" font-size="9" fill="#8a8a82" ' + MP_C + '>ΣΤΗΝ ΕΦΑΡΜΟΓΗ: ΠΡΟΪΟΝ → SKU</text>'
+ '<rect x="310" y="32" width="370" height="46" rx="4" fill="#fff" stroke="#111"/>'
+ '<text x="322" y="50" font-size="10" font-weight="700">ΔΟΚΙΜΑΣΤΙΚΟ ΓΚΡΙ</text>'
+ '<text x="322" y="68" font-size="8.5" fill="#444">SKU: ΕΙΔ-001 · ΕΙΔ-004 · ΕΙΔ-007 · … (τ.μ. / μ.μ., πάχος, τιμή, απόθεμα)</text>'
+ '<rect x="310" y="86" width="370" height="46" rx="4" fill="#fff" stroke="#111"/>'
+ '<text x="322" y="104" font-size="10" font-weight="700">ΔΟΚΙΜΑΣΤΙΚΟ ΜΠΕΖ</text>'
+ '<text x="322" y="122" font-size="8.5" fill="#444">SKU: ΕΙΔ-002 · ΕΙΔ-005 · …</text>'
+ '</svg>';

GUIDE.imp = {cards:[]};
var G = function(c){ GUIDE.imp.cards.push(c); };

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
             "Η στήλη «Ενεργός» είναι σημαντική: χωρίς αυτή μπαίνουν και οι πελάτες που έχετε χρόνια να δείτε.",
             "Εξάγετε σε Excel (.xlsx). Αν το πρόγραμμα δίνει CSV, JSON ή XML, κι αυτά διαβάζονται.",
             "Αν βγάλει παλιό Excel (.xls), ανοίξτε το στο Excel και «Αποθήκευση ως» → «Βιβλίο εργασίας Excel (.xlsx)».",
             "Ανοίξτε το αρχείο μία φορά πριν το φέρετε: η πρώτη γραμμή πρέπει να έχει ονόματα στηλών και από κάτω να φαίνονται πραγματικές επωνυμίες.",
             "Αν το πρόγραμμα δίνει κάποια άλλη μορφή, στείλτε μας ένα μικρό δείγμα — προστίθεται χωρίς να αλλάξει τίποτα άλλο."],
         en:["In the software's customer list, make these columns visible: Code, Name, VAT no., Tax office, Occupation, Address, City, Postcode, Phone, Mobile, Email, Category, Active/Inactive, Balance.",
             "For suppliers: the same columns, plus IBAN if available.",
             "For items: Code, Description, Group, Unit, Thickness, Finish, Sale price, Cost price, VAT rate, Stock, Active, Barcode.",
             "The «Active» column matters: without it, customers you have not seen in years come in too.",
             "Export to Excel (.xlsx). If the software gives CSV, JSON or XML, those are read as well.",
             "If it produces old Excel (.xls), open it in Excel and «Save as» → «Excel Workbook (.xlsx)».",
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
             "Στον πίνακα από κάτω, όποια τιμή θέλει έλεγχο έχει δίπλα κόκκινη ένδειξη «έλεγχος».",
             "«Μόνο ενεργοί»: αναμμένο από προεπιλογή. Αν το σβήσετε, μπαίνουν και οι ανενεργοί — στο δοκιμαστικό ο αριθμός γίνεται 77. Εμφανίζεται μόνο αν το αρχείο έχει στήλη Ενεργός/Ανενεργός.",
             "Αν γράφει «Αντιστοιχίστε τη στήλη που έχει την Επωνυμία», γυρίστε στο Βήμα 4."],
         en:["«File rows»: all rows found under the headings. Sample file: 82.",
             "«Will import»: rows that will be saved. Below it: how many are new and how many are updates. Sample: 67, all new.",
             "«Skipped»: no name + duplicates + inactive. Sample: 15 = 3 without a name, 2 duplicates, 10 inactive. A red frame means «take a look», not an error.",
             "A duplicate is a row with the same code — or, with no code, the same valid VAT number or the same name. Only the first one goes in.",
             "«To check»: VAT numbers with a wrong check digit and emails without «@». Sample: 5 = 2 VAT + 3 email. They ARE imported — just fix them later on the card.",
             "In the table below, any value needing a check carries a red «check» tag beside it.",
             "«Active only»: on by default. Switch it off and inactive customers come in too — in the sample the number becomes 77. It appears only if the file has an Active/Inactive column.",
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
             "Ανοίξτε έναν: η καρτέλα έχει όσα στοιχεία είχε το αρχείο, και στο «Ιστορικό» μια εγγραφή «Εισαγωγή — Από [όνομα αρχείου]».",
             "Διορθώστε ό,τι χρειάζεται με «✎ Επεξεργασία» — π.χ. το ΑΦΜ με την κόκκινη ένδειξη — και «✓ Αποθήκευση». Η αλλαγή σας ΔΕΝ χάνεται αν αργότερα ξαναφέρετε το ίδιο αρχείο· ενημερώνονται μόνο τα πεδία που έχει το αρχείο.",
             "Φέρνοντας ξανά το ίδιο αρχείο με «Προσθήκη», ο δείκτης γράφει «0 νέες · 67 ενημερώσεις» — δεν διπλασιάζεται τίποτα.",
             "Γυρίζοντας στην «Εισαγωγή δεδομένων», το αρχείο έχει κλείσει μόνο του — δεν γίνεται κατά λάθος δεύτερη εισαγωγή."],
         en:["Click «Open: Customers». The list shows your customers.",
             "Their code starts with «CL-» followed by your software's code (e.g. CL-ΔΟΚ-001). Suppliers: «SL-». Products: «PX-».",
             "The «Source» column reads «Import». The «Source: Import» filter shows them on their own.",
             "Open one: the card holds whatever the file had, and its «History» has an entry «Import — From [file name]».",
             "Fix what is needed with «✎ Edit» — e.g. the VAT number with the red tag — then «✓ Save». Your change is NOT lost if you later bring the same file again; only the fields in the file are updated.",
             "Bringing the same file again with «Add», the indicator reads «0 new · 67 updates» — nothing is duplicated.",
             "Back on «Data import», the file has closed by itself — no accidental second import."]},
  res:{el:"Η εφαρμογή δουλεύει με τους δικούς σας πελάτες.",
       en:"The app works with your own customers."},
  go:"goSec('crm','Πελάτες')"});

G({ic:"⑧", t:{el:"Βήμα 8 — Είδη αποθήκης: ομάδες και SKU", en:"Step 8 — Stock items: groups and SKUs"},
  pic:MP.items, picCap:{el:"Η «Ομάδα» του προγράμματός σας γίνεται προϊόν· κάθε είδος γίνεται SKU από κάτω.",
                        en:"Your software's «Group» becomes a product; each item becomes a SKU underneath."},
  see:{el:"Ίδια οθόνη με τους πελάτες, με το κουμπί «Είδη αποθήκης» επιλεγμένο. Στην αντιστοίχιση υπάρχουν πεδία όπως «Ομάδα (γίνεται προϊόν)», «Μονάδα μέτρησης», «Πάχος», «Τιμή πώλησης», «Απόθεμα».",
       en:"The same screen as customers, with «Stock items» selected. The matching offers fields such as «Group (becomes a product)», «Unit», «Thickness», «Sale price», «Stock»."},
  does:{el:"Στην εφαρμογή ένα προϊόν (π.χ. Titanium Grey) έχει πολλές παραλλαγές — πάχος, φινίρισμα, μορφή. Τα προγράμματα συνήθως κρατούν κάθε παραλλαγή ως ξεχωριστό είδος. Η εισαγωγή τα ξαναμαζεύει: ίδια ομάδα → ίδιο προϊόν.",
        en:"In the app one product (e.g. Titanium Grey) has many variants — thickness, finish, form. Business software usually keeps each variant as a separate item. The import regroups them: same group → same product."},
  steps:{el:["Πατήστε «Είδη αποθήκης» και φέρτε το αρχείο — ή «Δοκιμαστικό αρχείο»: 60 είδη σε 3 ομάδες, 6 ανενεργά.",
             "Ελέγξτε ότι η στήλη με την ομάδα δείχνει στο «Ομάδα (γίνεται προϊόν)». Αν τη βάλετε «— να μη μπει —», κάθε είδος γίνεται δικό του προϊόν.",
             "Μονάδες: «τ.μ.», «τμ», «m2» γίνονται m²· «μ.μ.», «τρεχ.» γίνονται μ.μ.· «τεμ.», «τμχ» γίνονται τεμ.",
             "Τιμές με ελληνική υποδιαστολή («40,50») διαβάζονται σωστά.",
             "Εισαγωγή. Δοκιμαστικό: μπαίνουν 54 SKU σε 3 νέα προϊόντα.",
             "Διαχείριση → Προϊόντα: τα νέα προϊόντα έχουν κωδικό «PX-». Τα 12 δικά μας μένουν όπως είναι.",
             "Τα νέα SKU εμφανίζονται αμέσως στη λίστα υλικών του δελτίου παραγγελίας.",
             "Τεχνικά χαρακτηριστικά (πυκνότητα, αντοχές) ΔΕΝ έρχονται από το πρόγραμμα — συμπληρώνονται στο προϊόν → «Τεχνικά»."],
         en:["Click «Stock items» and bring the file — or «Sample file»: 60 items in 3 groups, 6 inactive.",
             "Check that the group column points to «Group (becomes a product)». Set it to «— do not import —» and each item becomes its own product.",
             "Units: «τ.μ.», «τμ», «m2» become m²; «μ.μ.», «τρεχ.» become running metres; «τεμ.», «τμχ» become pieces.",
             "Prices with a Greek decimal comma («40,50») are read correctly.",
             "Import. Sample: 54 SKUs go into 3 new products.",
             "Admin → Products: the new products carry a «PX-» code. Our 12 stay as they are.",
             "The new SKUs appear at once in the material list of the order sheet.",
             "Technical data (density, strengths) do NOT come from the software — fill them in on the product → «Technical»."]},
  res:{el:"Τα είδη σας είναι διαθέσιμα σε δελτία και προσφορές, ομαδοποιημένα όπως τα σκέφτεστε.",
       en:"Your items are available in sheets and quotations, grouped the way you think of them."},
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
             "«Παλιά μορφή Excel (.xls)»: ανοίξτε το στο Excel και αποθηκεύστε ως .xlsx ή CSV.",
             "«Δεν βρέθηκε γραμμή επικεφαλίδων»: το αρχείο δεν έχει ονόματα στηλών. Ξαναβγάλτε το με επικεφαλίδες.",
             "«Αντιστοιχίστε τη στήλη που έχει την Επωνυμία»: στο Βήμα 4 διαλέξτε ποια στήλη είναι η επωνυμία.",
             "«Δεν χώρεσε — τίποτα δεν άλλαξε»: τα δεδομένα ξεπερνούν τον χώρο του browser. Ανάψτε «Μόνο ενεργοί» ή αφαιρέστε φωτογραφίες.",
             "«Ο browser δεν ανοίγει αρχεία Excel»: πολύ παλιός browser. Ενημερώστε Chrome / Edge / Firefox ή αποθηκεύστε το αρχείο ως CSV.",
             "Ελληνικά που φαίνονται σαν «ÅðùíõìÝá»: σπάνιο — στείλτε μας το αρχείο. (Τα CSV σε κωδικοποίηση Windows-1253 διαβάζονται ήδη αυτόματα.)",
             "Οποιοδήποτε άλλο μήνυμα: κάντε μια φωτογραφία της οθόνης και στείλτε την μαζί με το αρχείο."],
         en:["«The file holds only the internal code of each record»: the export ran without columns (what happened on 09/09). Go back to Step 2. Try it with the «File without columns» button.",
             "«Old Excel format (.xls)»: open it in Excel and save as .xlsx or CSV.",
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
