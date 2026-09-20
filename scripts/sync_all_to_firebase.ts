import Database from "better-sqlite3";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCP3dgQ2cX47hy_hwI_qEgFuUjMSyAdtOI",
  authDomain: "carematrix-b32f0.firebaseapp.com",
  projectId: "carematrix-b32f0",
  storageBucket: "carematrix-b32f0.firebasestorage.app",
  messagingSenderId: "463309902822",
  appId: "1:463309902822:web:9555cc0379937f49ac7c27",
  measurementId: "G-TDRDK5WWB3"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const firestore = getFirestore(app);

export async function syncAllSQLiteToFirebase(onProgress?: (msg: string, percent: number) => void) {
  const db = new Database("cliniq.db");
  console.log("==================================================");
  console.log("CareMatrix Firebase Data Migration Initialized");
  console.log("Target Project: carematrix-b32f0");
  console.log("==================================================");

  const results: Record<string, number> = {};

  try {
    // 1. Patients (413 records)
    const patients = db.prepare("SELECT * FROM patients ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${patients.length} patients...`);
    let pCount = 0;
    for (const p of patients) {
      const docId = String(p.id);
      await setDoc(doc(firestore, "patients", docId), {
        ...p,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      pCount++;
      if (pCount % 50 === 0 || pCount === patients.length) {
        const pct = Math.round((pCount / patients.length) * 100);
        console.log(`Patients: ${pCount}/${patients.length} (${pct}%)`);
        if (onProgress) onProgress(`Synced ${pCount}/${patients.length} patients`, pct);
      }
    }
    results.patients = pCount;

    // 2. Doctors (40 records)
    const doctors = db.prepare("SELECT * FROM doctors ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${doctors.length} doctors...`);
    let dCount = 0;
    for (const d of doctors) {
      const docId = String(d.id);
      await setDoc(doc(firestore, "doctors", docId), {
        ...d,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      dCount++;
    }
    results.doctors = dCount;

    // 3. Users (69 records)
    const users = db.prepare("SELECT * FROM users ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${users.length} users...`);
    let uCount = 0;
    for (const u of users) {
      const docId = (u.username || String(u.id)).trim().toLowerCase();
      // Don't store plain password if not needed, or store safe profile
      await setDoc(doc(firestore, "users", docId), {
        id: docId,
        username: u.username,
        name: u.name,
        role: u.role,
        login_count: u.login_count || 0,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      uCount++;
    }
    results.users = uCount;

    // 4. Appointments (263 records)
    const appointments = db.prepare("SELECT * FROM appointments ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${appointments.length} appointments...`);
    let aCount = 0;
    for (const a of appointments) {
      const docId = String(a.id);
      await setDoc(doc(firestore, "appointments", docId), {
        ...a,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      aCount++;
    }
    results.appointments = aCount;

    // 5. Vitals (13 records)
    const vitals = db.prepare("SELECT * FROM vitals ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${vitals.length} vitals...`);
    let vCount = 0;
    for (const v of vitals) {
      const docId = String(v.id);
      await setDoc(doc(firestore, "vitals", docId), {
        ...v,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      vCount++;
    }
    results.vitals = vCount;

    // 6. Alerts (113 records)
    const alerts = db.prepare("SELECT * FROM alerts ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${alerts.length} alerts...`);
    let alCount = 0;
    for (const al of alerts) {
      const docId = String(al.id);
      await setDoc(doc(firestore, "alerts", docId), {
        ...al,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      alCount++;
    }
    results.alerts = alCount;

    // 7. Private Data (401 records)
    const privateData = db.prepare("SELECT * FROM private_data ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${privateData.length} private_data records...`);
    let prCount = 0;
    for (const pr of privateData) {
      const docId = String(pr.id);
      await setDoc(doc(firestore, "private_data", docId), {
        ...pr,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      prCount++;
      if (prCount % 100 === 0 || prCount === privateData.length) {
        console.log(`Private Data: ${prCount}/${privateData.length}`);
      }
    }
    results.private_data = prCount;

    // 8. Prescriptions
    const prescriptions = db.prepare("SELECT * FROM prescriptions ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${prescriptions.length} prescriptions...`);
    let rxCount = 0;
    for (const rx of prescriptions) {
      const docId = String(rx.id);
      await setDoc(doc(firestore, "prescriptions", docId), {
        ...rx,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      rxCount++;
    }
    results.prescriptions = rxCount;

    // 9. Pending Lab Results
    const labs = db.prepare("SELECT * FROM pending_lab_results ORDER BY id ASC").all() as any[];
    console.log(`Syncing ${labs.length} pending lab results...`);
    let labCount = 0;
    for (const lb of labs) {
      const docId = String(lb.id);
      await setDoc(doc(firestore, "pending_lab_results", docId), {
        ...lb,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      labCount++;
    }
    results.pending_lab_results = labCount;

    // 10. Dashboard Stats
    await setDoc(doc(firestore, "stats", "dashboard_summary"), {
      totalPatients: patients.length,
      totalDoctors: doctors.length,
      totalUsers: users.length,
      totalAppointments: appointments.length,
      totalAlerts: alerts.length,
      totalVitals: vitals.length,
      totalPrivateRecords: privateData.length,
      updatedAt: new Date().toISOString(),
      projectId: "carematrix-b32f0"
    }, { merge: true });
    results.stats = 1;

    console.log("==================================================");
    console.log("Migration to Firebase carematrix-b32f0 completed!");
    console.log(JSON.stringify(results, null, 2));
    console.log("==================================================");
    return { success: true, results };
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('Missing or insufficient permissions')) {
      console.error("\n==================================================");
      console.error("⛔ FIRESTORE SECURITY RULES LOCKED (carematrix-b32f0)");
      console.error("==================================================");
      console.error("Your Firebase project is denying write permissions because default rules are active.");
      console.error("To allow Option B (terminal script) to write records to Firestore:");
      console.error("1. Open: https://console.firebase.google.com/project/carematrix-b32f0/firestore/rules");
      console.error("2. Replace the contents with:\n");
      console.error("rules_version = '2';");
      console.error("service cloud.firestore {");
      console.error("  match /databases/{database}/documents {");
      console.error("    match /{document=**} {");
      console.error("      allow read, write: if true;");
      console.error("    }");
      console.error("  }");
      console.error("}\n");
      console.error("3. Click 'Publish'.");
      console.error("4. Re-run: npx tsx scripts/sync_all_to_firebase.ts");
      console.error("==================================================\n");
    } else {
      console.error("Migration error:", err);
    }
    return { success: false, error: err.message || String(err), results };
  }
}

if (process.argv[1]?.includes("sync_all_to_firebase")) {
  syncAllSQLiteToFirebase().then(res => {
    if (!res.success) {
      console.error("Process finished with error:", res.error);
      process.exit(1);
    } else {
      console.log("Process finished successfully!");
      process.exit(0);
    }
  });
}
