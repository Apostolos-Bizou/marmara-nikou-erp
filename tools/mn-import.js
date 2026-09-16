/*MNI:BEGIN v1*/
/* ============================================================
   ΕΙΣΑΓΩΓΗ ΔΕΔΟΜΕΝΩΝ — ΠΕΛΑΤΕΣ · ΠΡΟΜΗΘΕΥΤΕΣ · ΕΙΔΗ  (Φ28)
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
/* κάρτα οδηγού */
if(typeof GUIDE !== "undefined" && GUIDE.admin && GUIDE.admin.cards){
  GUIDE.admin.cards.push({ic:"⤓",
    t:{el:"Εισαγωγή πελατών, προμηθευτών και ειδών", en:"Importing customers, suppliers and items"},
    see:{el:"Διαχείριση → Εισαγωγή δεδομένων. Τρία κουμπιά (Πελάτες, Προμηθευτές, Είδη αποθήκης) και επιλογή αρχείου. Το ίδιο κουμπί υπάρχει και δίπλα στο «+ Νέος» κάθε λίστας.",
         en:"Admin → Data import. Three buttons (Customers, Suppliers, Stock items) and a file picker. The same button also sits next to “+ New” on each list."},
    does:{el:"Διαβάζει το αρχείο από το πρόγραμμά σας, βρίσκει μόνη της ποια στήλη είναι η επωνυμία, το ΑΦΜ, η πόλη, και σας δείχνει τι θα μπει πριν μπει. Τα δεδομένα μένουν μόνο σε αυτόν τον υπολογιστή.",
          en:"Reads the export from your current software, works out which column is the name, VAT number and city, and shows you what will be imported before it happens. The data stays on this computer only."},
    steps:{el:["Πατήστε τι φέρνετε — π.χ. «Πελάτες».",
               "«Επιλογή αρχείου…» και διαλέξτε την εξαγωγή (Excel, CSV, JSON ή XML).",
               "Στο «Ποια στήλη είναι τι» ελέγξτε τις αντιστοιχίσεις· διορθώστε όποια είναι λάθος. Τη διόρθωση τη θυμάται την επόμενη φορά.",
               "Στο «Τι θα μπει» δείτε πόσες εγγραφές μπαίνουν, πόσες είναι διπλές και ποια ΑΦΜ θέλουν έλεγχο.",
               "Διαλέξτε «Προσθήκη» ή «Αντικατάσταση των δοκιμαστικών» και πατήστε «Εισαγωγή».",
               "Αν κάτι δεν σας αρέσει, «Επαναφορά» στο ιστορικό — επιστρέφουν τα δοκιμαστικά."],
           en:["Click what you are bringing in — e.g. “Customers”.",
               "“Choose file…” and pick the export (Excel, CSV, JSON or XML).",
               "Under “Which column is what”, check the matches and fix any wrong one. The fix is remembered next time.",
               "Under “What will be imported”, see how many records go in, how many are duplicates and which VAT numbers need checking.",
               "Choose “Add” or “Replace the sample data” and click “Import”.",
               "If you don't like the result, use “Restore” in the history — the sample data comes back."]},
    res:{el:"Η καρτέλα πελατών δείχνει τους δικούς σας πελάτες. Αν το αρχείο δεν έχει στήλες (μόνο κωδικούς), η εφαρμογή το λέει καθαρά αντί να σβήσει τα δοκιμαστικά.",
         en:"The customer list shows your own customers. If the file has no columns (codes only), the app says so plainly instead of wiping the sample data."}});
}
/*MNI:END*/
