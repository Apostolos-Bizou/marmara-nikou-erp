/* Πακετάρισμα πραγματικών αρχείων του πελάτη σε ΚΡΥΠΤΟΓΡΑΦΗΜΕΝΟ αρχείο για το site.
   Τα αρχικά .xls ΔΕΝ μπαίνουν ποτέ στο repo — μόνο το data/nikou-data.enc.

   Χρήση (PowerShell):
     $env:MN_DATA_PASS = "ο-κωδικός"
     node tools\pack-data.js data\nikou-data.enc customers=ΔΙΑΔΡΟΜΗ\ΠΕΛΑΤΕΣ.xls suppliers=ΔΙΑΔΡΟΜΗ\ΠΡΟΜΗΘΕΥΤΕΣ.xls products=ΔΙΑΔΡΟΜΗ\ΠΡΟΙΟΝΤΑ.xls
     Remove-Item Env:MN_DATA_PASS

   Κρυπτογράφηση: gzip → AES-256-GCM, κλειδί με PBKDF2-SHA256 (250.000 επαναλήψεις).
   Ο browser την ανοίγει με WebCrypto, μόνο με τον σωστό κωδικό. */
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const { webcrypto } = require("crypto");
const subtle = webcrypto.subtle;

(async () => {
  const [,, out, ...pairs] = process.argv;
  const pass = process.env.MN_DATA_PASS || "";
  if(!out || !pairs.length){ console.error("Χρήση: node tools/pack-data.js <έξοδος.enc> customers=… suppliers=… products=…"); process.exit(2); }
  if(pass.length < 10){ console.error("✗ Ο κωδικός (MN_DATA_PASS) πρέπει να έχει τουλάχιστον 10 χαρακτήρες."); process.exit(2); }
  const types = ["customers", "suppliers", "products"];
  const files = [];
  for(const p of pairs){
    const i = p.indexOf("="), type = p.slice(0, i), file = p.slice(i + 1);
    if(types.indexOf(type) < 0){ console.error("✗ Άγνωστο είδος: " + type); process.exit(2); }
    if(!fs.existsSync(file)){ console.error("✗ Δεν βρέθηκε: " + file); process.exit(2); }
    const buf = fs.readFileSync(file);
    files.push({ type, name: path.basename(file), b64: buf.toString("base64") });
    console.log("  + " + type + " ← " + path.basename(file) + " (" + buf.length.toLocaleString("el-GR") + " bytes)");
  }
  files.sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type));
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify({ packed: new Date().toISOString(), files }), "utf8"), { level: 9 });
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const iter = 250000;
  const base = await subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base,
                                     { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const b64 = u => Buffer.from(u).toString("base64");
  const pkg = { v: 1, kdf: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), ct: b64(ct),
                count: files.length, packed: new Date().toISOString().slice(0, 10) };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(pkg));
  /* έλεγχος: ξανανοίγει με τον ίδιο κωδικό */
  const k2 = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base,
                                    { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const back = zlib.gunzipSync(Buffer.from(await subtle.decrypt({ name: "AES-GCM", iv }, k2, ct)));
  const chk = JSON.parse(back.toString("utf8"));
  if(chk.files.length !== files.length) { console.error("✗ Ο έλεγχος αποκρυπτογράφησης απέτυχε."); process.exit(1); }
  /* έλεγχος: κανένα κομμάτι απλού κειμένου στο αποτέλεσμα */
  const txt = fs.readFileSync(out, "utf8");
  if(/ΠΕΛΑΤ|Επωνυμία|ΑΦΜ/.test(txt)) { console.error("✗ Το αρχείο εξόδου περιέχει αναγνώσιμο κείμενο."); process.exit(1); }
  console.log("OK · " + out + " · " + fs.statSync(out).size.toLocaleString("el-GR") + " bytes · " + files.length + " αρχεία · κρυπτογραφημένο");
})().catch(e => { console.error("✗ " + e.message); process.exit(1); });
