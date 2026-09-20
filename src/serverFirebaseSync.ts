import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";

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

/**
 * Automatically sync patient record to Firestore in real time
 */
export async function autoSyncPatient(patient: any) {
  if (!patient || !patient.id) return;
  try {
    const docId = String(patient.id);
    await setDoc(doc(firestore, "patients", docId), {
      ...patient,
      id: docId,
      updatedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Auto-Firebase] Patient #${docId} synced automatically`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error syncing patient #${patient?.id}:`, err?.message || err);
  }
}

/**
 * Automatically delete patient record from Firestore
 */
export async function autoDeletePatient(patientId: any) {
  if (!patientId) return;
  try {
    const docId = String(patientId);
    await deleteDoc(doc(firestore, "patients", docId));
    console.log(`[Auto-Firebase] Patient #${docId} deleted from Firestore`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error deleting patient #${patientId}:`, err?.message || err);
  }
}

/**
 * Automatically sync appointment record to Firestore in real time
 */
export async function autoSyncAppointment(appointment: any) {
  if (!appointment || !appointment.id) return;
  try {
    const docId = String(appointment.id);
    await setDoc(doc(firestore, "appointments", docId), {
      ...appointment,
      id: docId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Auto-Firebase] Appointment #${docId} synced automatically`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error syncing appointment #${appointment?.id}:`, err?.message || err);
  }
}

/**
 * Automatically sync vitals record to Firestore in real time
 */
export async function autoSyncVital(vital: any) {
  if (!vital || !vital.id) return;
  try {
    const docId = String(vital.id);
    await setDoc(doc(firestore, "vitals", docId), {
      ...vital,
      id: docId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Auto-Firebase] Vital record #${docId} synced automatically`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error syncing vital #${vital?.id}:`, err?.message || err);
  }
}

/**
 * Automatically sync prescription record to Firestore in real time
 */
export async function autoSyncPrescription(prescription: any) {
  if (!prescription || !prescription.id) return;
  try {
    const docId = String(prescription.id);
    await setDoc(doc(firestore, "prescriptions", docId), {
      ...prescription,
      id: docId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Auto-Firebase] Prescription #${docId} synced automatically`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error syncing prescription #${prescription?.id}:`, err?.message || err);
  }
}

/**
 * Automatically sync alert record to Firestore in real time
 */
export async function autoSyncAlert(alert: any) {
  if (!alert || !alert.id) return;
  try {
    const docId = String(alert.id);
    await setDoc(doc(firestore, "alerts", docId), {
      ...alert,
      id: docId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Auto-Firebase] Alert #${docId} synced automatically`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error syncing alert #${alert?.id}:`, err?.message || err);
  }
}

/**
 * Automatically sync private data vault record to Firestore in real time
 */
export async function autoSyncPrivateData(item: any) {
  if (!item || !item.id) return;
  try {
    const docId = String(item.id);
    await setDoc(doc(firestore, "private_data", docId), {
      ...item,
      id: docId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Auto-Firebase] Private data #${docId} synced automatically`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error syncing private data #${item?.id}:`, err?.message || err);
  }
}

/**
 * Automatically delete private data record from Firestore
 */
export async function autoDeletePrivateData(id: any) {
  if (!id) return;
  try {
    const docId = String(id);
    await deleteDoc(doc(firestore, "private_data", docId));
    console.log(`[Auto-Firebase] Private data #${docId} deleted from Firestore`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error deleting private data #${id}:`, err?.message || err);
  }
}

/**
 * Automatically sync user record to Firestore in real time
 */
export async function autoSyncUser(user: any) {
  if (!user || !user.username) return;
  try {
    const cleanUsername = String(user.username).trim().toLowerCase();
    await setDoc(doc(firestore, "users", cleanUsername), {
      username: cleanUsername,
      name: user.name || cleanUsername,
      role: user.role || "staff",
      loginCount: user.login_count || 1,
      lastActiveAt: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Auto-Firebase] User '${cleanUsername}' synced automatically`);
  } catch (err: any) {
    console.warn(`[Auto-Firebase] Error syncing user '${user?.username}':`, err?.message || err);
  }
}
