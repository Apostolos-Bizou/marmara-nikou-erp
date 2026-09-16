/* Εγκατάσταση Φ28 (μηχανή εισαγωγής) στο index.html.
   Χρήση:  node apply-import.js index.html mn-import.js
   - Ελέγχει ότι κάθε σημείο αγκύρωσης υπάρχει ΑΚΡΙΒΩΣ μία φορά· αλλιώς σταματά χωρίς αλλαγή.
   - Ξανατρέχει με ασφάλεια: αν η μηχανή υπάρχει ήδη, αντικαθιστά μόνο το μπλοκ MNI. */
const fs = require("fs");
const [,, htmlPath, modPath] = process.argv;
if(!htmlPath || !modPath){ console.error("Χρήση: node apply-import.js index.html mn-import.js"); process.exit(2); }

let s = fs.readFileSync(htmlPath, "utf8");
const mod = fs.readFileSync(modPath, "utf8").trim();
const before = s.length;

function once(label, from, to){
  if(s.includes(to)) { console.log("  = " + label + " (υπάρχει ήδη)"); return; }
  const n = s.split(from).length - 1;
  if(n !== 1){ console.error("✗ " + label + ": βρέθηκε " + n + " φορές (αναμενόταν 1). ΚΑΜΙΑ αλλαγή."); process.exit(1); }
  s = s.replace(from, to);
  console.log("  ✓ " + label);
}

/* 1. ταφόπλακες στο backfill του loadState */
once("loadState: δεν ξαναφέρνει ό,τι σβήστηκε",
  "if(r&&r[key]!=null&&!have[r[key]]){ d.push(clone(r)); changed=true; }",
  "if(r&&r[key]!=null&&!have[r[key]]&&!mnIsRemoved(k2,r[key])){ d.push(clone(r)); changed=true; }");

/* 2. το ίδιο σιωπηλό σφάλμα σε θέσεις, κέντρα, διαδρομές */
once("locDel → ταφόπλακα",
  "  DATA.locations=DATA.locations.filter(function(l){ return l.code!==code; });",
  "  mnTomb(\"locations\",code); DATA.locations=DATA.locations.filter(function(l){ return l.code!==code; });");
once("wcDel → ταφόπλακα",
  "  DATA.workCentres=DATA.workCentres.filter(function(c){ return c.id!==id; });",
  "  mnTomb(\"workCentres\",id); DATA.workCentres=DATA.workCentres.filter(function(c){ return c.id!==id; });");
once("rtDel → ταφόπλακα",
  "  DATA.routes=DATA.routes.filter(function(r){ return r.id!==id; });",
  "  mnTomb(\"routes\",id); DATA.routes=DATA.routes.filter(function(r){ return r.id!==id; });");

/* 3. το μπλοκ της μηχανής, πριν από την εκκίνηση */
const B = "/*MNI:BEGIN", E = "/*MNI:END*/";
if(s.includes(B)){
  const i = s.indexOf(B), j = s.indexOf(E) + E.length;
  s = s.slice(0, i) + mod + s.slice(j);
  console.log("  ✓ μπλοκ MNI αντικαταστάθηκε");
} else {
  const anchor = "\nloadState();\n/* Αν ήρθε από deep link";
  const n = s.split(anchor).length - 1;
  if(n !== 1){ console.error("✗ σημείο εκκίνησης: " + n + " φορές. ΚΑΜΙΑ αλλαγή."); process.exit(1); }
  s = s.replace(anchor, "\n" + mod + "\n" + anchor);
  console.log("  ✓ μπλοκ MNI προστέθηκε");
}

/* 4. σύντομος έλεγχος σύνταξης του script */
const a = s.indexOf("<script>"), b = s.lastIndexOf("</script>");
try { new Function(s.slice(a + 8, b)); }
catch(e){ console.error("✗ Συντακτικό λάθος μετά την αλλαγή: " + e.message + ". ΚΑΜΙΑ αλλαγή."); process.exit(1); }

fs.writeFileSync(htmlPath, s, "utf8");
console.log("OK · " + before + " → " + s.length + " χαρακτήρες · γραμμές: " + s.split("\n").length);
