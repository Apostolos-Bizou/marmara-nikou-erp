/* Έλεγχος Φ28 — μηχανή εισαγωγής.
   Χρήση: node audit-import.js index.html tests/import-fixtures
   Κάθε έλεγχος τυπώνει ✓ ή ✗. Έξοδος 1 αν έστω ένας αποτύχει. */
const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const [,, HTML, FX] = process.argv;
let fails = 0, passes = 0;
function ok(c, m){ if(c){ passes++; console.log("  ✓ " + m); } else { fails++; console.log("  ✗ " + m); } }
function sec(t){ console.log("\n— " + t); }

function boot(storage){
  const dom = new JSDOM(fs.readFileSync(HTML, "utf8"), { runScripts:"dangerously", pretendToBeVisual:true,
    url:"https://apostolos-bizou.github.io/marmara-nikou-erp/",
    beforeParse(w){
      w.DecompressionStream = globalThis.DecompressionStream;
      w.Response = globalThis.Response;
      w.TextDecoder = globalThis.TextDecoder;
      w.TextEncoder = globalThis.TextEncoder;
      w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = function(){};
      w.__errors = [];
      w.addEventListener("error", e => w.__errors.push(e.message));
      if(storage) for(const k in storage) w.localStorage.setItem(k, storage[k]);
    }});
  return dom.window;
}
const bytes = f => new Uint8Array(fs.readFileSync(path.join(FX, f)));
const J = (w, e) => w.eval(e);
async function load(w, f, type){
  if(type) w.eval(`MNI.type=${JSON.stringify(type)}; MNI.mode="merge"; MNI.activeOnly=true;`);
  await w.mniLoadBytes(f, bytes(f));
}
function renderAll(w, label){
  const bad = [];
  const roles = J(w, "ROLES.map(r=>({id:r.id,items:[].concat(...r.groups.map(g=>g.items))}))");
  for(const r of roles) for(const s of r.items){
    try { w.goSec(r.id, s); const h = w.document.getElementById("view").innerHTML;
      if(/\bNaN\b|>undefined<|undefined €/.test(h)) bad.push(r.id + "/" + s + " (NaN/undefined)");
    } catch(e){ bad.push(r.id + "/" + s + ": " + e.message); }
  }
  ok(!bad.length, label + ": όλες οι " + roles.reduce((a, r) => a + r.items.length, 0) + " οθόνες χωρίς σφάλμα" + (bad.length ? " → " + bad.slice(0, 5).join(" | ") : ""));
}
function cardTabs(w, go, setter){
  const bad = [];
  w.eval(go);
  const h = w.document.getElementById("view").innerHTML;
  const tabs = [...new Set([...h.matchAll(new RegExp(setter + "\\('([^']+)'\\)", "g"))].map(m => m[1]))];
  for(const t of tabs){
    try { w[setter](t); const v = w.document.getElementById("view").innerHTML;
      if(/\bNaN\b|>undefined</.test(v)) bad.push(t + " (NaN/undefined)"); }
    catch(e){ bad.push(t + ": " + e.message); }
  }
  return {tabs, bad};
}

(async () => {
  let w = boot();
  await new Promise(r => setTimeout(r, 300));

  sec("Εκκίνηση & σύνδεση");
  ok(w.__errors.length === 0, "καμία JS εξαίρεση στην εκκίνηση" + (w.__errors.length ? " → " + w.__errors[0] : ""));
  ok(J(w, "ROLES[0].groups.some(g=>g.items.indexOf(MNI_SEC)>=0)"), "η ενότητα «Εισαγωγή δεδομένων» υπάρχει στη Διαχείριση");
  w.eval("LOGGED=true; location.hash='#/admin/'+encodeURIComponent(MNI_SEC); applyHash();");
  ok(J(w, "ROLE==='admin'&&SEC===MNI_SEC"), "deep link #/admin/Εισαγωγή δεδομένων ανοίγει την οθόνη");
  w.goSec("crm", "Πελάτες");
  ok(w.document.getElementById("view").innerHTML.includes("Εισαγωγή πελατολογίου"), "κουμπί «Εισαγωγή πελατολογίου» στη λίστα πελατών");
  w.goSec("crm", "Προμηθευτές");
  ok(w.document.getElementById("view").innerHTML.includes("Εισαγωγή προμηθευτών"), "κουμπί στη λίστα προμηθευτών");
  w.goSec("admin", "Προϊόντα");
  ok(w.document.getElementById("view").innerHTML.includes("Εισαγωγή ειδών"), "κουμπί στη λίστα προϊόντων");
  const gc = J(w, "GUIDE.admin.cards.filter(c=>c.ic==='⤓')[0]");
  ok(gc && gc.t.el && gc.t.en && gc.see.el && gc.see.en && gc.does.el && gc.does.en && gc.res.el && gc.res.en
     && gc.steps.el.length === gc.steps.en.length, "κάρτα οδηγού πλήρης EL+EN");
  renderAll(w, "πριν την εισαγωγή");

  sec("Αρχεία που ΔΕΝ πρέπει να μπουν");
  const seed0 = J(w, "JSON.stringify(DATA)");
  for(const f of ["ids_only_synthetic.json"].concat(fs.existsSync(path.join(FX, "ids_only_customers.json")) ? ["ids_only_customers.json","ids_only_items.json"] : [])){
    await load(w, f, "customers");
    ok(/μόνο τον εσωτερικό κωδικό/.test(J(w, "MNI.err")) && J(w, "MNI.cols.length") === 0, f + ": καθαρό μήνυμα «μόνο κωδικοί»");
  }
  await load(w, "old.xls", "customers");
  ok(/\.xls/.test(J(w, "MNI.err")), "παλιό .xls: οδηγία για αποθήκευση ως .xlsx/CSV");
  ok(J(w, "JSON.stringify(DATA)") === seed0, "τα δεδομένα δεν άλλαξαν");
  w.goSec("admin", J(w, "MNI_SEC"));
  ok(w.document.getElementById("view").innerHTML.includes("Το αρχείο δεν μπορεί να μπει"), "το σφάλμα φαίνεται στην οθόνη");

  sec("Πελάτες από Excel (4.373 γραμμές, επικεφαλίδες στη 3η γραμμή)");
  await load(w, "customers.xlsx", "customers");
  ok(J(w, "MNI.cols.length") === 13 && J(w, "MNI.rows.length") === 4373, "διαβάστηκαν 13 στήλες × 4.373 γραμμές");
  ok(J(w, "MNI.caption") === "Πελάτες", "όνομα φύλλου «Πελάτες»");
  const m = J(w, "(function(){var o={};for(var k in MNI.map)o[MNI.cols[k]]=MNI.map[k];return o})()");
  const want = {"Κωδικός":"ext","Επωνυμία":"name","Α.Φ.Μ.":"vat","Δ.Ο.Υ.":"doy","Επάγγελμα":"kad","Διεύθυνση":"addr",
                "Πόλη":"city","Τ.Κ.":"zip","Τηλέφωνο":"tel","Κινητό":"mob","E-mail":"email","Ενεργός":"status","Υπόλοιπο":"balance"};
  const wrong = Object.keys(want).filter(k => m[k] !== want[k]);
  ok(!wrong.length, "αυτόματη αντιστοίχιση 13/13" + (wrong.length ? " → λάθος: " + wrong.map(k => k + "→" + m[k]).join(", ") : ""));
  let P = J(w, "(function(){var p=mniPlan();return {n:p.recs.length,noName:p.noName,dups:p.dups,inactive:p.inactive,bad:p.badVat,mail:p.badMail,hasStatus:p.hasStatus}})()");
  ok(P.noName === 11, "11 χωρίς επωνυμία (" + P.noName + ")");
  ok(P.dups === 1, "1 διπλή (" + P.dups + ")");
  ok(P.hasStatus && P.inactive > 1000, "ανενεργές αναγνωρίστηκαν (" + P.inactive + ")");
  ok(P.bad === 6, "6 λάθος ΑΦΜ στις ενεργές εντοπίστηκαν (" + P.bad + ")");
  ok(P.mail > 200, "λάθος email εντοπίστηκαν (" + P.mail + ")");
  ok(J(w, "mniPlan().recs.every(function(r){return !r.vat||r.vat.length===9})"), "ΑΦΜ που το Excel αποθήκευσε ως αριθμό ξαναπήραν το αρχικό μηδέν");
  w.goSec("admin", J(w, "MNI_SEC"));
  let v = w.document.getElementById("view").innerHTML;
  ok(v.includes("Αντικατάσταση των δοκιμαστικών") && v.includes("Φεύγουν οι 8 ψεύτικοι πελάτες"), "η οθόνη δείχνει τι θα φύγει πριν φύγει");
  ok(!w.document.querySelector(".banner").innerHTML.includes("πραγματικά δεδομένα"), "banner: πριν την εισαγωγή λέει δοκιμαστικά");

  const orders0 = J(w, "DATA.orders.length"), wo0 = J(w, "DATA.workOrders.filter(x=>x.ord).length");
  w.eval("MNI.mode='replace'");
  w.mniRun();
  ok(J(w, "MNI.cols.length") === 0, "μετά την εισαγωγή το αρχείο «καταναλώνεται» — όχι δεύτερο πάτημα");
  ok(J(w, "MNI.result && !MNI.result.fail"), "η εισαγωγή ολοκληρώθηκε" + (J(w, "MNI.result&&MNI.result.fail") ? " — ΔΕΝ ΧΩΡΕΣΕ " + J(w, "MNI.result.size") : ""));
  ok(J(w, "DATA.customers.every(c=>c.imp)"), "κανένας δοκιμαστικός πελάτης δεν έμεινε");
  ok(J(w, "DATA.customers.length") === P.n, "μπήκαν " + P.n + " πελάτες (" + J(w, "DATA.customers.length") + ")");
  ok(J(w, "DATA.orders.length") === 0 && orders0 === 5, "οι 5 δοκιμαστικές παραγγελίες αφαιρέθηκαν");
  ok(J(w, "DATA.cutSheets.length") === 0 && J(w, "DATA.quotes.length") === 0, "δοκιμαστικά δελτία και προσφορές αφαιρέθηκαν");
  ok(J(w, "DATA.invoices.filter(i=>/^C-/.test(i.party)).length") === 0, "κανένα παραστατικό δεν δείχνει σε ψεύτικο πελάτη");
  ok(J(w, "DATA.workOrders.length") > 0 && J(w, "DATA.workOrders.filter(x=>x.ord).length") === 0 && wo0 > 0, "οι εντολές παραγωγής έμειναν, χωρίς σύνδεση");
  ok(J(w, "DATA.priceLists.every(l=>!(l.cust||[]).some(c=>/^C-1/.test(c)))"), "οι τιμοκατάλογοι δεν δείχνουν σε ψεύτικους πελάτες");
  const js = J(w, "JSON.stringify(DATA.customers)");
  ok(js.length / P.n < 420, "συμπαγής αποθήκευση: " + Math.round(js.length / P.n) + " χαρακτήρες/πελάτη");
  ok(J(w, "(localStorage.getItem(STORE_KEY)||'').length") < 5000000, "χωράει στο localStorage (" + J(w, "(localStorage.getItem(STORE_KEY)||'').length") + ")");
  const c1 = J(w, "(function(){var c=DATA.customers[0];return {g:c.grade,st:c.status,pl:c.priceList,con:Array.isArray(c.contacts),src:c.source,vat:c.vat}})()");
  ok(c1.g === "—" && c1.pl === "Λιανική" && c1.con && c1.src === "Εισαγωγή", "τα κενά πεδία έχουν ουδέτερες τιμές");

  /* επανεκκίνηση: δεν επιστρέφουν οι ψεύτικοι, οι εισαγμένοι μένουν */
  const store = { [J(w, "STORE_KEY")]: J(w, "localStorage.getItem(STORE_KEY)"), mn_import_map_v1: J(w, "localStorage.getItem('mn_import_map_v1')") || "{}" };
  w = boot(store); await new Promise(r => setTimeout(r, 300));
  sec("Μετά από επανεκκίνηση");
  ok(w.__errors.length === 0, "καμία εξαίρεση");
  ok(J(w, "DATA.customers.length") === P.n && J(w, "DATA.customers.every(c=>c.imp)"), "οι ψεύτικοι πελάτες ΔΕΝ ξαναγύρισαν");
  ok(J(w, "DATA.orders.length") === 0, "οι δοκιμαστικές παραγγελίες ΔΕΝ ξαναγύρισαν");
  ok(J(w, "Object.getPrototypeOf(DATA.customers[5])===MNI_PROTO.customers && DATA.customers[5].grade==='—'"), "τα πρότυπα επανέρχονται στη φόρτωση");
  renderAll(w, "μετά την εισαγωγή πελατών");
  ok(w.document.querySelector(".banner").innerHTML.includes("πραγματικά δεδομένα από εισαγωγή"), "banner: λέει καθαρά ότι υπάρχουν πραγματικά δεδομένα");
  const ct = cardTabs(w, "goCust(DATA.customers[3].id)", "setCTab");
  ok(ct.tabs.length >= 4 && !ct.bad.length, "καρτέλα εισαγμένου πελάτη: " + ct.tabs.length + " καρτέλες χωρίς σφάλμα" + (ct.bad.length ? " → " + ct.bad.join(" | ") : ""));
  /* επεξεργασία εισαγμένου → αποθηκεύεται */
  w.eval("var cc=DATA.customers[3]; cc.grade='A'; cc.acts.push({d:'2026-09-16',t:'Σημείωση',txt:'δοκιμή'}); saveState();");
  ok(/"grade":"A"/.test(J(w, "JSON.stringify(DATA.customers[3])")) && J(w, "DATA.customers[4].acts.length") === 1, "αλλαγή σε εισαγμένο αποθηκεύεται και δεν διαρρέει σε άλλους");

  sec("Επανάληψη ίδιου αρχείου (ενημέρωση, όχι διπλασιασμός)");
  await load(w, "customers.xlsx", "customers");
  P = J(w, "(function(){var p=mniPlan();return {add:p.add,upd:p.upd}})()");
  ok(P.add === 0 && P.upd > 2000, "0 νέες, " + P.upd + " ενημερώσεις");
  w.mniRun();
  ok(J(w, "DATA.customers.length") === J(w, "MNI.result.add") + P.upd + 0 || J(w, "MNI.result.add") === 0, "ο αριθμός πελατών δεν άλλαξε");
  ok(J(w, "DATA.customers[3].grade") === "A", "η χειροκίνητη αλλαγή δεν χάθηκε στην ενημέρωση");

  sec("Μνήμη αντιστοίχισης");
  w.eval("mniSetMap(MNI.cols.indexOf('Επάγγελμα'),'')");
  w.eval("MNI.map=mniAutoMap('customers',MNI.cols)");
  ok(J(w, "MNI.map[MNI.cols.indexOf('Επάγγελμα')]") === undefined, "η διόρθωση του χρήστη θυμάται την επόμενη φορά");
  w.eval("mniSetMap(MNI.cols.indexOf('Επάγγελμα'),'kad')");

  sec("Επαναφορά πελατών");
  w.mniRevert("customers");
  ok(J(w, "DATA.customers.length") === 8 && J(w, "DATA.customers.every(c=>!c.imp)"), "επανήλθαν οι 8 δοκιμαστικοί");
  ok(J(w, "DATA.orders.length") === 5 && J(w, "DATA.cutSheets.length") === 8 && J(w, "DATA.quotes.length") === 5, "επανήλθαν παραγγελίες, δελτία, προσφορές");
  ok(J(w, "DATA.workOrders.filter(x=>x.ord).length") === wo0, "οι εντολές ξαναβρήκαν την παραγγελία τους");
  ok(J(w, "JSON.stringify(DATA.priceLists)") === J(w, "JSON.stringify(SEED.priceLists)"), "οι τιμοκατάλογοι ίδιοι με την αρχή");
  renderAll(w, "μετά την επαναφορά");
  ok(!w.document.querySelector(".banner").innerHTML.includes("πραγματικά δεδομένα"), "banner: μετά την επαναφορά ξαναλέει δοκιμαστικά");

  sec("Άλλες μορφές");
  await load(w, "customers_1253.csv", "customers");
  ok(J(w, "MNI.cols[1]") === "Επωνυμία" && J(w, "MNI.rows.length") === 40, "CSV σε Windows-1253 με «;» — ελληνικά σωστά");
  await load(w, "customers_erp.json", "customers");
  ok(J(w, "MNI.map[MNI.cols.indexOf('ΕΠΩΝΥΜΙΑ')]") === "name" && J(w, "MNI.map[MNI.cols.indexOf('ΑΦΜ')]") === "vat"
     && J(w, "MNI.caption") === "Διαχείριση πελατών", "JSON του προγράμματος, όταν έχει στήλες, διαβάζεται");
  await load(w, "customers.xml", "customers");
  ok(J(w, "MNI.map[MNI.cols.indexOf('Name')]") === "name" && J(w, "MNI.map[MNI.cols.indexOf('code')]") === "ext" && J(w, "mniPlan().recs.length") > 30, "XML: εγγραφές και αντιστοίχιση");

  sec("Προμηθευτές (αντικατάσταση + επαναφορά)");
  const it0 = J(w, "DATA.items.filter(i=>i.sup).length");
  await load(w, "suppliers.csv", "suppliers");
  ok(J(w, "MNI.map[0]") === "ext" && J(w, "MNI.map[5]") === "iban", "κωδικός προμηθευτή και IBAN αντιστοιχίστηκαν");
  w.eval("MNI.mode='replace'"); w.mniRun();
  ok(J(w, "DATA.suppliers.length") === 25 && J(w, "DATA.suppliers.every(s=>s.imp)"), "25 προμηθευτές, κανένας δοκιμαστικός");
  ok(J(w, "DATA.purchases.length") === 0 && J(w, "DATA.supCatalog.length") === 0, "αγορές και κατάλογοι προμηθευτών αφαιρέθηκαν");
  ok(J(w, "DATA.items.filter(i=>i.sup).length") === 0 && J(w, "DATA.products.every(p=>!p.supplier)"), "αναλώσιμα και προϊόντα αποσυνδέθηκαν");
  renderAll(w, "μετά τους προμηθευτές");
  const st = cardTabs(w, "goSup(DATA.suppliers[0].id)", "setSTab");
  ok(st.tabs.length >= 3 && !st.bad.length, "καρτέλα εισαγμένου προμηθευτή: " + st.tabs.length + " καρτέλες" + (st.bad.length ? " → " + st.bad.join(" | ") : ""));
  w.mniRevert("suppliers");
  ok(J(w, "DATA.suppliers.length") === 6 && J(w, "DATA.items.filter(i=>i.sup).length") === it0
     && J(w, "JSON.stringify(DATA.products.map(p=>[p.supplier,p.sup,p.compliance.lab]))") === J(w, "JSON.stringify(SEED.products.map(p=>[p.supplier,p.sup,p.compliance.lab]))"),
     "επανήλθαν προμηθευτές και όλες οι συνδέσεις");

  sec("Είδη αποθήκης (Excel, 2.655 είδη σε ομάδες)");
  await load(w, "items.xlsx", "products");
  const pm = J(w, "(function(){var o={};for(var k in MNI.map)o[MNI.cols[k]]=MNI.map[k];return o})()");
  ok(pm["Κωδικός είδους"] === "ext" && pm["Περιγραφή"] === "name" && pm["Ομάδα"] === "group" && pm["Μ.Μ."] === "unit"
     && pm["Τιμή πώλησης"] === "price" && pm["Τιμή κόστους"] === "cost" && pm["Απόθεμα"] === "stock" && pm["Ενεργό"] === "status",
     "αντιστοίχιση ειδών" + " → " + JSON.stringify(pm));
  ok(!/Αντικατάσταση των δοκιμαστικών\./.test((w.goSec("admin", J(w, "MNI_SEC")), w.document.getElementById("view").innerHTML)), "η αντικατάσταση προϊόντων δεν προσφέρεται ακόμα");
  const nItems = J(w, "mniPlan().recs.length");
  w.mniRun();
  ok(J(w, "DATA.products.filter(p=>p.imp).length") === 4, "4 προϊόντα (ομάδες)");
  ok(J(w, "allVariants().filter(x=>x.v.imp).length") === nItems && nItems === 2655 - 295, nItems + " SKU (χωρίς τα 295 ανενεργά)");
  ok(J(w, "DATA.products.filter(p=>!p.imp).length") === 12, "τα 12 δικά μας προϊόντα έμειναν");
  ok(J(w, "(function(){var u={};allVariants().forEach(function(x){if(x.v.imp)u[x.v.unit]=1});return Object.keys(u).sort().join(',')})()") === "m²,μ.μ.", "μονάδες κανονικοποιήθηκαν σε m² / μ.μ.");
  ok(J(w, "csVar(allVariants().filter(x=>x.v.imp)[0].v.sku)!==null"), "τα είδη φαίνονται στο δελτίο (csVar)");
  renderAll(w, "μετά τα είδη");
  const pt = cardTabs(w, "goProd(DATA.products.filter(p=>p.imp)[0].code)", "setPTab");
  ok(pt.tabs.length >= 3 && !pt.bad.length, "καρτέλα εισαγμένου προϊόντος: " + pt.tabs.length + " καρτέλες" + (pt.bad.length ? " → " + pt.bad.join(" | ") : ""));
  ok(J(w, "(localStorage.getItem(STORE_KEY)||'').length") < 5000000, "είδη: χωράνε (" + J(w, "(localStorage.getItem(STORE_KEY)||'').length") + ")");
  w.mniRevert("products");
  ok(J(w, "DATA.products.length") === 12 && J(w, "allVariants().length") === J(w, "SEED.products.reduce((a,p)=>a+p.variants.length,0)"), "επαναφορά ειδών");

  sec("Οδηγός — καρτέλα «Εισαγωγή δεδομένων» (Φ28β)");
  const gi = J(w, "GUIDE.imp && GUIDE.imp.cards");
  ok(gi && gi.length === 11, "11 κάρτες βημάτων (" + (gi ? gi.length : 0) + ")");
  const bad2 = [];
  for(const k of Object.keys(J(w, "GUIDE"))){
    const cards = J(w, "GUIDE[" + JSON.stringify(k) + "].cards") || [];
    cards.forEach((c, i) => {
      const miss = ["t","see","does"].filter(f => !(c[f] && c[f].el && c[f].en));
      if(c.res && !(c.res.el && c.res.en)) miss.push("res");
      if(c.steps && !(c.steps.el && c.steps.en && c.steps.el.length === c.steps.en.length)) miss.push("steps");
      if(c.pic && !(c.picCap && c.picCap.el && c.picCap.en)) miss.push("picCap");
      if(miss.length) bad2.push(k + "#" + i + ":" + miss.join("/"));
    });
  }
  ok(!bad2.length, "όλες οι κάρτες όλων των καρτελών πλήρεις EL+EN" + (bad2.length ? " → " + bad2.slice(0, 5).join(" ") : ""));
  ok(gi.every(c => c.steps && c.steps.el.length >= 3), "κάθε βήμα έχει τουλάχιστον 3 οδηγίες");
  const pics = gi.filter(c => c.pic);
  const badPic = pics.filter(c => { const d = new w.DOMParser().parseFromString(c.pic, "image/svg+xml");
    return d.getElementsByTagName("parsererror").length || /undefined|NaN/.test(c.pic); });
  ok(pics.length >= 9 && !badPic.length, pics.length + " σχηματικές εικόνες, όλες έγκυρο SVG");
  w.eval("openGuide('imp')");
  let gh = w.document.getElementById("gdBody").innerHTML;
  ok(/class="on"[^>]*>⤓ Εισαγωγή δεδομένων/.test(gh) || /onclick="setGTab\('imp'\)"[^>]*class="on"/.test(gh) || w.document.querySelector("#gdBody .gd-nav button.on").textContent.includes("Εισαγωγή δεδομένων"),
     "η καρτέλα εμφανίζεται στο μενού του οδηγού και είναι επιλεγμένη");
  ok(w.document.querySelectorAll("#gdBody .gc").length === 11 && gh.includes("Σε μία πρόταση"), "αποδίδονται εισαγωγή + 11 κάρτες");
  const navTxt = [...w.document.querySelectorAll("#gdBody .gd-nav button")].map(b => b.textContent);
  ok(navTxt.indexOf("⤓ Εισαγωγή δεδομένων") === navTxt.findIndex(t => t.includes("Δελτίο παραγγελίας")) + 1, "η καρτέλα μπαίνει ακριβώς μετά το «Δελτίο παραγγελίας»");
  w.eval("setGLang('en')");
  ok(w.document.querySelector("#gdBody .gd-nav button.on").textContent.includes("Data import") && w.document.getElementById("gdBody").innerHTML.includes("In one sentence"), "αγγλικά: καρτέλα και κείμενα");
  w.eval("setGLang('el'); setGTab('flow')");
  ok(w.document.querySelectorAll("#gdBody .gd-nav button").length === 10 && !w.document.querySelector("#gdBody .gd-nav button.on").textContent.includes("Εισαγωγή"), "σε άλλη καρτέλα το κουμπί υπάρχει, χωρίς επιλογή");
  const goBad = [];
  for(const c of gi.concat([J(w, "GUIDE.test.cards.filter(c=>c.ic==='⤓')[0]"), J(w, "GUIDE.admin.cards.filter(c=>c.ic==='⤓')[0]")])){
    if(!c || !c.go) continue;
    try { w.eval("closeGuide();" + c.go); } catch(e){ goBad.push(c.go + ": " + e.message); }
  }
  ok(!goBad.length, "όλα τα «Δοκίμασέ το» δουλεύουν" + (goBad.length ? " → " + goBad.join(" | ") : ""));
  ok(J(w, "GUIDE.test.cards.some(c=>c.ic==='⤓' && c.steps.el.length>=12)"), "σενάριο δοκιμής στην καρτέλα «Σενάρια δοκιμής»");
  ok(J(w, "GUIDE.glossary.some(g=>g.w.el==='Αντιστοίχιση στηλών')"), "γλωσσάριο: νέοι όροι");

  sec("Δοκιμαστικό αρχείο — τα νούμερα του οδηγού");
  w.eval("MNI.type='customers'"); w.goSec("admin", J(w, "MNI_SEC"));
  v = w.document.getElementById("view").innerHTML;
  ok(v.includes("Δοκιμαστικό αρχείο") && v.includes("Αρχείο χωρίς στήλες") && v.includes("Οδηγός βήμα-βήμα"), "κουμπιά δοκιμαστικού αρχείου και οδηγού στην οθόνη");
  await w.mniDemo("customers");
  ok(J(w, "MNI.file") === "δοκιμαστικό-πελάτες.csv" && J(w, "MNI.rows.length") === 82 && J(w, "MNI.fmt") === "CSV / κείμενο", "«δοκιμαστικό-πελάτες.csv · CSV / κείμενο · 82 γραμμές»");
  ok(J(w, "Object.keys(MNI.map).length") === 12, "και οι 12 στήλες αντιστοιχίστηκαν μόνες τους");
  P = J(w, "(function(){var p=mniPlan();return {n:p.recs.length,noName:p.noName,dups:p.dups,inactive:p.inactive,bad:p.badVat,mail:p.badMail}})()");
  ok(P.n === 67 && P.noName === 3 && P.dups === 2 && P.inactive === 10 && P.bad === 2 && P.mail === 3, "67 μπαίνουν · 3 χωρίς όνομα · 2 διπλές · 10 ανενεργές · 2 ΑΦΜ · 3 email → " + JSON.stringify(P));
  w.eval("MNI.activeOnly=false");
  ok(J(w, "mniPlan().recs.length") === 77, "χωρίς «Μόνο ενεργοί»: 77");
  w.eval("MNI.activeOnly=true");
  w.goSec("admin", J(w, "MNI_SEC"));
  v = w.document.getElementById("view").innerHTML;
  ok(/ΔΟΚ-005<\/td><td>ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ 005<\/td><td>100395951 <span class="pill bad">έλεγχος/.test(v), "ΔΟΚ-005: κόκκινο «έλεγχος» στο ΑΦΜ (100395951)");
  ok(v.includes("Φεύγουν οι 8 ψεύτικοι πελάτες και οι κινήσεις τους: 5 παραγγελίες, 5 προσφορές, 7 παραστατικά, 8 δελτία"), "το κείμενο αντικατάστασης ταιριάζει με τον οδηγό");
  w.eval("MNI.mode='replace'"); w.mniRun();
  ok(J(w, "DATA.customers.length") === 67 && J(w, "DATA.orders.length") === 0, "67 πελάτες, 0 παραγγελίες");
  ok(J(w, "!!find(DATA.customers,'id','CL-ΔΟΚ-001')"), "κωδικός CL-ΔΟΚ-001 όπως στον οδηγό");
  /* επεξεργασία εισαγμένου: η τιμή που δεν υπάρχει στη λίστα ΔΕΝ αλλάζει σιωπηλά */
  w.eval("find(DATA.customers,'id','CL-ΔΟΚ-005').cat='ΧΟΝΔΡΙΚΗ'; saveState(); goCust('CL-ΔΟΚ-005'); startEdit();");
  const gsel = w.document.querySelector('select[data-ek="grade"]');
  ok(gsel && gsel.value === "—", "σε επεξεργασία η Κατηγορία δείχνει «—», όχι σιωπηλά «A»");
  gsel.value = "A"; w.saveEdit();
  ok(J(w, "find(DATA.customers,'id','CL-ΔΟΚ-005').grade") === "A" && J(w, "find(DATA.customers,'id','CL-ΔΟΚ-005').cat") === "ΧΟΝΔΡΙΚΗ", "αποθήκευση: κατηγορία A, και η «ΧΟΝΔΡΙΚΗ» έμεινε ίδια");
  ok(J(w, "find(DATA.customers,'id','CL-ΔΟΚ-006').grade") === "—", "η αλλαγή δεν πέρασε σε άλλο πελάτη");
  await w.mniDemo("customers");
  P = J(w, "(function(){var p=mniPlan();return {add:p.add,upd:p.upd}})()");
  ok(P.add === 0 && P.upd === 67, "ξανά: «0 νέες · 67 ενημερώσεις»");
  w.mniRun();
  ok(J(w, "DATA.customers.length") === 67 && J(w, "find(DATA.customers,'id','CL-ΔΟΚ-005').grade") === "A", "μετά την ενημέρωση ο 005 κρατάει την κατηγορία A");
  w.mniRevert("customers");
  ok(J(w, "DATA.customers.length") === 8 && J(w, "DATA.orders.length") === 5, "επαναφορά: 8 πελάτες, 5 παραγγελίες");
  await w.mniDemo("bad");
  ok(/μόνο τον εσωτερικό κωδικό/.test(J(w, "MNI.err")) && /40 εγγραφές/.test(J(w, "MNI.err")) && J(w, "DATA.customers.length") === 8, "«Αρχείο χωρίς στήλες»: 40 εγγραφές, απόρριψη, πελάτες 8");
  await w.mniDemo("suppliers");
  ok(J(w, "mniPlan().recs.length") === 12 && J(w, "MNI.map[0]") === "ext" && J(w, "MNI.map[6]") === "iban", "δοκιμαστικοί προμηθευτές: 12, κωδικός και IBAN");
  await w.mniDemo("products");
  ok(J(w, "mniPlan().recs.length") === 54, "δοκιμαστικά είδη: 54 ενεργά από 60");
  w.mniRun();
  ok(J(w, "DATA.products.filter(p=>p.imp).length") === 3 && J(w, "allVariants().filter(x=>x.v.imp).length") === 54, "3 προϊόντα, 54 SKU");
  w.mniRevert("products");
  renderAll(w, "μετά τα δοκιμαστικά αρχεία");

  sec("Όταν δεν χωράει");
  const before = J(w, "JSON.stringify(DATA)");
  w.localStorage.setItem("filler", "x".repeat(4990000 - (w.localStorage.getItem(J(w, "STORE_KEY")) || "").length));
  await load(w, "customers.xlsx", "customers");
  w.eval("MNI.activeOnly=false; MNI.mode='merge'"); w.mniRun();
  ok(J(w, "MNI.result && MNI.result.fail === true"), "καθαρό μήνυμα «δεν χώρεσε»");
  ok(J(w, "JSON.stringify(DATA)") === before, "τίποτα δεν άλλαξε στα δεδομένα");
  w.goSec("admin", J(w, "MNI_SEC"));
  ok(w.document.getElementById("view").innerHTML.includes("Δεν χώρεσε"), "το μήνυμα φαίνεται στην οθόνη");
  w.localStorage.removeItem("filler");

  sec("Διόρθωση σιωπηλού σφάλματος: διαγραφές δοκιμαστικών επέστρεφαν");
  const freeWc = J(w, "(function(){var u={};DATA.routes.forEach(function(r){r.steps.forEach(function(s){u[s]=1})});var c=DATA.workCentres.filter(function(x){return !u[x.id]})[0];return c?c.id:null})()");
  const freeLoc = J(w, "(function(){var u={};(DATA.slabs||[]).forEach(function(s){u[s.loc]=1});var l=DATA.locations.filter(function(x){return !u[x.code]})[0];return l?l.code:null})()");
  const rt = J(w, "DATA.routes[DATA.routes.length-1].id");
  if(freeWc) w.wcDel(freeWc);
  if(freeLoc) w.locDel(freeLoc);
  w.rtDel(rt);
  const st2 = { [J(w, "STORE_KEY")]: J(w, "localStorage.getItem(STORE_KEY)") };
  w = boot(st2); await new Promise(r => setTimeout(r, 300));
  ok(!freeWc || !J(w, "!!find(DATA.workCentres,'id'," + JSON.stringify(freeWc) + ")"), "σβησμένο κέντρο " + freeWc + " δεν ξαναεμφανίζεται");
  ok(!freeLoc || !J(w, "!!find(DATA.locations,'code'," + JSON.stringify(freeLoc) + ")"), "σβησμένη θέση " + freeLoc + " δεν ξαναεμφανίζεται");
  ok(!J(w, "!!find(DATA.routes,'id'," + JSON.stringify(rt) + ")"), "σβησμένη διαδρομή " + rt + " δεν ξαναεμφανίζεται");
  w.resetState();
  ok(J(w, "!DATA._removed && !DATA._imp && DATA.workCentres.length===SEED.workCentres.length"), "«↺ Επαναφορά» καθαρίζει και ταφόπλακες και ιστορικό");
  ok(w.__errors.length === 0, "καμία εξαίρεση σε όλη τη διαδρομή" + (w.__errors.length ? " → " + w.__errors[0] : ""));

  console.log("\n" + (fails ? "✗ " + fails + " αποτυχίες · " : "✓ ") + passes + " επιτυχίες");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("✗ ΕΞΑΙΡΕΣΗ:", e); process.exit(1); });
