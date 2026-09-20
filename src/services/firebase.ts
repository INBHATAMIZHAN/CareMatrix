import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { 
  getFirestore, 
  doc, 
  getDocFromServer,
  getDoc,
  collection,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  increment,
  writeBatch
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

// CareMatrix Firebase project configuration provided by user
export const firebaseConfig = {
  apiKey: "AIzaSyCP3dgQ2cX47hy_hwI_qEgFuUjMSyAdtOI",
  authDomain: "carematrix-b32f0.firebaseapp.com",
  projectId: "carematrix-b32f0",
  storageBucket: "carematrix-b32f0.firebasestorage.app",
  messagingSenderId: "463309902822",
  appId: "1:463309902822:web:9555cc0379937f49ac7c27",
  measurementId: "G-TDRDK5WWB3"
};

// Target database ID - (default) for standard Firebase projects
export const FIRESTORE_DATABASE_ID = appletConfig.firestoreDatabaseId || "(default)";

// Initialize Firebase client instance
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Analytics safely (supported in browser with IndexedDB)
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
      console.log('[Firebase] Analytics initialized for CareMatrix (carematrix-b32f0)');
    }
  }).catch((err) => {
    console.debug('[Firebase] Analytics not supported in current environment:', err);
  });
}

// Connect to Firestore database (using default or specified ID)
export const db = (FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== "(default)")
  ? getFirestore(app, FIRESTORE_DATABASE_ID)
  : getFirestore(app);

// Connectivity validation helper as mandated by firebase guidelines
export async function testFirestoreConnection(): Promise<{ connected: boolean; error?: string; permissionDenied?: boolean }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] Connected to CareMatrix Firestore database successfully');
    return { connected: true };
  } catch (error: any) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable') || error.message.includes('Could not reach Cloud Firestore'))) {
      console.warn('[Firebase] Operating in offline mode or connecting in background.');
      return { connected: false, error: 'Client is offline' };
    }
    if (error?.code === 'permission-denied' || error?.message?.includes('PERMISSION_DENIED') || error?.message?.includes('Missing or insufficient permissions')) {
      console.warn('[Firebase] Firestore reached carematrix-b32f0, but security rules require read/write permission.');
      return { 
        connected: false, 
        permissionDenied: true,
        error: 'Firestore security rules in Firebase Console require allow read, write.' 
      };
    }
    // Any other response indicates network reachability to Firestore
    console.log('[Firebase] Firestore initialized and active:', error?.message || 'Ready');
    return { connected: true };
  }
}

/**
 * Store user registration and login details in Firestore `users` collection
 */
export async function saveUserToFirestore(userData: {
  username: string;
  name: string;
  role: 'doctor' | 'nurse' | 'patient';
  hospitalCode?: string;
  password?: string;
}): Promise<void> {
  try {
    const cleanUsername = userData.username.trim().toLowerCase();
    if (!cleanUsername) return;
    
    const userDocRef = doc(db, 'users', cleanUsername);
    await setDoc(userDocRef, {
      username: cleanUsername,
      name: userData.name,
      role: userData.role,
      hospitalCode: userData.hospitalCode || '',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      loginCount: 1,
      syncedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[Firebase] User '${cleanUsername}' login details saved to Firestore`);
  } catch (err) {
    console.warn('[Firebase] User save warning:', err);
  }
}

/**
 * Record a user login in Firestore database (tracks login count and last login timestamp)
 */
export async function recordLoginInFirestore(userData: {
  username: string;
  name?: string;
  role?: string;
}): Promise<void> {
  try {
    const cleanUsername = (userData.username || '').trim().toLowerCase();
    if (!cleanUsername) return;

    const userDocRef = doc(db, 'users', cleanUsername);
    const existing = await getDoc(userDocRef);

    if (existing.exists()) {
      await updateDoc(userDocRef, {
        lastLoginAt: new Date().toISOString(),
        loginCount: increment(1)
      });
    } else {
      await setDoc(userDocRef, {
        username: cleanUsername,
        name: userData.name || cleanUsername,
        role: userData.role || 'patient',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        loginCount: 1
      }, { merge: true });
    }
    console.log(`[Firebase] Logged login event for user '${cleanUsername}' in Firestore`);
  } catch (err) {
    console.warn('[Firebase] Record login warning:', err);
  }
}

/**
 * Store patient record in Firestore `patients` collection
 */
export async function syncPatientToFirestore(patient: any): Promise<void> {
  try {
    if (!patient) return;
    const patientId = String(patient.id || `P-${Date.now()}`);
    const docRef = doc(db, 'patients', patientId);
    
    await setDoc(docRef, {
      ...patient,
      id: patientId,
      name: patient.name || 'Unknown Patient',
      age: Number(patient.age) || 0,
      gender: patient.gender || 'Other',
      weight: Number(patient.weight) || 0,
      blood_group: patient.blood_group || 'O+',
      allergies: patient.allergies || 'None',
      chronic_conditions: patient.chronic_conditions || 'None',
      past_illness: patient.past_illness || 'None',
      status: patient.status || 'Active',
      updatedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    }, { merge: true });
    
    console.log(`[Firebase] Patient record #${patientId} (${patient.name}) stored in Firestore`);
  } catch (err) {
    console.warn('[Firebase] Patient sync warning:', err);
  }
}

/**
 * Sync batch of patients to Firestore
 */
export async function syncPatientsBatchToFirestore(patients: any[]): Promise<void> {
  if (!patients || patients.length === 0) return;
  // Sync up to 25 patients at a time to prevent high burst
  const slice = patients.slice(0, 30);
  for (const p of slice) {
    await syncPatientToFirestore(p);
  }
}

/**
 * Store prescription record in Firestore `prescriptions` collection
 */
export async function syncPrescriptionToFirestore(prescription: any): Promise<void> {
  try {
    if (!prescription) return;
    const docId = prescription.id ? String(prescription.id) : null;
    const data = {
      ...prescription,
      patient_id: String(prescription.patient_id || ''),
      syncedAt: new Date().toISOString()
    };
    if (docId) {
      await setDoc(doc(db, 'prescriptions', docId), data, { merge: true });
      console.log(`[Firebase] Prescription #${docId} stored in Firestore`);
    } else {
      const colRef = collection(db, 'prescriptions');
      const docRef = await addDoc(colRef, data);
      console.log(`[Firebase] Prescription stored in Firestore (${docRef.id})`);
    }
  } catch (err) {
    console.warn('[Firebase] Prescription sync warning:', err);
  }
}

/**
 * Store appointment in Firestore `appointments` collection
 */
export async function syncAppointmentToFirestore(appointment: any): Promise<void> {
  try {
    if (!appointment) return;
    const docId = appointment.id ? String(appointment.id) : null;
    const data = {
      ...appointment,
      patient_name: appointment.patient_name || '',
      doctor_name: appointment.doctor_name || '',
      date: appointment.date || new Date().toISOString().split('T')[0],
      syncedAt: new Date().toISOString()
    };
    if (docId) {
      await setDoc(doc(db, 'appointments', docId), data, { merge: true });
      console.log(`[Firebase] Appointment #${docId} stored in Firestore`);
    } else {
      const colRef = collection(db, 'appointments');
      const docRef = await addDoc(colRef, data);
      console.log(`[Firebase] Appointment stored in Firestore (${docRef.id})`);
    }
  } catch (err) {
    console.warn('[Firebase] Appointment sync warning:', err);
  }
}

/**
 * Store patient vitals in Firestore `vitals` collection
 */
export async function syncVitalToFirestore(vital: any): Promise<void> {
  try {
    if (!vital) return;
    const docId = vital.id ? String(vital.id) : null;
    const data = {
      ...vital,
      patient_id: String(vital.patient_id || ''),
      recorded_at: vital.recorded_at || new Date().toISOString(),
      syncedAt: new Date().toISOString()
    };
    if (docId) {
      await setDoc(doc(db, 'vitals', docId), data, { merge: true });
      console.log(`[Firebase] Vital #${docId} stored in Firestore`);
    } else {
      const colRef = collection(db, 'vitals');
      const docRef = await addDoc(colRef, data);
      console.log(`[Firebase] Vital record stored in Firestore (${docRef.id})`);
    }
  } catch (err) {
    console.warn('[Firebase] Vital sync warning:', err);
  }
}

/**
 * Store private data vault record in Firestore `private_data` collection
 */
export async function syncPrivateDataToFirestore(item: {
  id?: number | string;
  staff_id: string;
  staff_name: string;
  patient_id?: number | string | null;
  content: string;
  created_at?: string;
}): Promise<void> {
  try {
    if (!item || !item.content) return;
    const docId = item.id ? String(item.id) : `PV-${Date.now()}`;
    const docRef = doc(db, 'private_data', docId);
    await setDoc(docRef, {
      id: docId,
      staff_id: item.staff_id || 'STAFF001',
      staff_name: item.staff_name || 'Staff',
      patient_id: item.patient_id ? String(item.patient_id) : null,
      content: item.content,
      created_at: item.created_at || new Date().toISOString(),
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Firebase] Private data record #${docId} stored in Firestore`);
  } catch (err) {
    console.warn('[Firebase] Private data sync warning:', err);
  }
}

/**
 * Store clinical alert in Firestore `alerts` collection
 */
export async function syncAlertToFirestore(alert: {
  id?: number | string;
  patient_id: number | string;
  type: string;
  message: string;
  status?: string;
}): Promise<void> {
  try {
    if (!alert) return;
    const docId = alert.id ? String(alert.id) : null;
    const data = {
      ...alert,
      patient_id: String(alert.patient_id),
      status: alert.status || 'active',
      created_at: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    };
    if (docId) {
      await setDoc(doc(db, 'alerts', docId), data, { merge: true });
      console.log(`[Firebase] Alert #${docId} stored in Firestore`);
    } else {
      const colRef = collection(db, 'alerts');
      const docRef = await addDoc(colRef, data);
      console.log(`[Firebase] Alert stored in Firestore (${docRef.id})`);
    }
  } catch (err) {
    console.warn('[Firebase] Alert sync warning:', err);
  }
}

/**
 * Store dashboard statistics summary in Firestore `stats` collection
 */
export async function syncStatsToFirestore(stats: {
  totalPatients: number;
  todayVisits: number;
  activeCases?: number;
}): Promise<void> {
  try {
    if (!stats) return;
    const docRef = doc(db, 'stats', 'dashboard_summary');
    await setDoc(docRef, {
      ...stats,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('[Firebase] Dashboard stats synced to Firestore');
  } catch (err) {
    console.warn('[Firebase] Stats sync warning:', err);
  }
}

/**
 * Seed initial sample hospital patients and user profiles into Firestore
 * if they are not already populated, ensuring the console displays them immediately.
 */
export async function seedInitialHospitalData(): Promise<void> {
  try {
    const testDoc = await getDoc(doc(db, 'patients', 'P-1001'));
    if (testDoc.exists()) {
      return; // Already initialized
    }

    // Seed core clinical patients
    const samplePatients = [
      { id: 'P-1001', name: 'Aarav Sharma', age: 34, gender: 'Male', weight: 72, blood_group: 'B+', allergies: 'Penicillin', chronic_conditions: 'Hypertension', past_illness: 'None', status: 'Active' },
      { id: 'P-1002', name: 'Priya Patel', age: 29, gender: 'Female', weight: 58, blood_group: 'O+', allergies: 'None', chronic_conditions: 'Asthma', past_illness: 'Bronchitis', status: 'Active' },
      { id: 'P-1003', name: 'Sunita Verma', age: 52, gender: 'Female', weight: 64, blood_group: 'A+', allergies: 'Sulfa', chronic_conditions: 'Type 2 Diabetes', past_illness: 'Kidney Stones', status: 'Under Observation' },
      { id: 'P-1004', name: 'Abdul Khan', age: 45, gender: 'Male', weight: 81, blood_group: 'AB+', allergies: 'None', chronic_conditions: 'None', past_illness: 'Pneumonia', status: 'Recovered' },
      { id: 'P-1005', name: 'Kavita Reddy', age: 38, gender: 'Female', weight: 62, blood_group: 'O-', allergies: 'Aspirin', chronic_conditions: 'Migraine', past_illness: 'None', status: 'Active' }
    ];

    for (const patient of samplePatients) {
      await setDoc(doc(db, 'patients', patient.id), {
        ...patient,
        created_at: new Date().toISOString(),
        syncedAt: new Date().toISOString()
      }, { merge: true });
    }

    // Seed initial demo/staff user profiles in the users collection
    const sampleUsers = [
      { username: 'doctor1', name: 'Dr. Rajesh Sharma', role: 'doctor', hospitalCode: 'CLINI-2024' },
      { username: 'nurse1', name: 'Nurse Meena Kumari', role: 'nurse', hospitalCode: 'CLINI-2024' },
      { username: 'patient1', name: 'Aarav Sharma', role: 'patient' }
    ];

    for (const u of sampleUsers) {
      await setDoc(doc(db, 'users', u.username), {
        username: u.username,
        name: u.name,
        role: u.role,
        hospitalCode: u.hospitalCode || '',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        loginCount: 1,
        syncedAt: new Date().toISOString()
      }, { merge: true });
    }

    console.log('[Firebase] Initial clinical patients and users seeded successfully to database ' + FIRESTORE_DATABASE_ID);
  } catch (err) {
    console.warn('[Firebase] Initial data seeding error:', err);
  }
}

/**
 * Store doctor record in Firestore `doctors` collection
 */
export async function syncDoctorToFirestore(doctor: any): Promise<void> {
  try {
    if (!doctor) return;
    const docId = String(doctor.id || `DR-${Date.now()}`);
    await setDoc(doc(db, 'doctors', docId), {
      ...doctor,
      id: docId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Firebase] Doctor record #${docId} stored in Firestore`);
  } catch (err) {
    console.warn('[Firebase] Doctor sync warning:', err);
  }
}

/**
 * Store pending lab result in Firestore `pending_lab_results` collection
 */
export async function syncPendingLabToFirestore(lab: any): Promise<void> {
  try {
    if (!lab) return;
    const docId = String(lab.id || `LAB-${Date.now()}`);
    await setDoc(doc(db, 'pending_lab_results', docId), {
      ...lab,
      id: docId,
      syncedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`[Firebase] Lab result #${docId} stored in Firestore`);
  } catch (err) {
    console.warn('[Firebase] Lab result sync warning:', err);
  }
}

/**
 * Comprehensive bulk insertion function:
 * Exports all data from the local database API and inserts all records into the new CareMatrix Firebase Firestore database.
 */
export async function exportAndSyncAllDataToFirebase(
  onProgress?: (status: { message: string; current: number; total: number; collection: string }) => void
): Promise<{ success: boolean; counts: Record<string, number>; error?: string }> {
  const counts: Record<string, number> = {
    patients: 0,
    doctors: 0,
    users: 0,
    appointments: 0,
    vitals: 0,
    alerts: 0,
    private_data: 0,
    prescriptions: 0,
    pending_lab_results: 0
  };

  try {
    // 1. Fetch full dataset from local database export endpoint
    const response = await fetch('/api/firebase/export-all-data');
    if (!response.ok) {
      throw new Error(`Failed to fetch database records: HTTP ${response.status}`);
    }
    const data = await response.json();

    const {
      patients = [],
      doctors = [],
      users = [],
      appointments = [],
      vitals = [],
      alerts = [],
      private_data = [],
      prescriptions = [],
      pending_lab_results = []
    } = data;

    const totalRecords = 
      patients.length + doctors.length + users.length + 
      appointments.length + vitals.length + alerts.length + 
      private_data.length + prescriptions.length + pending_lab_results.length;

    let processed = 0;

    // Helper to update progress
    const report = (coll: string, msg: string) => {
      if (onProgress) {
        onProgress({ message: msg, current: processed, total: totalRecords, collection: coll });
      }
    };

    // 2. Insert Patients
    report('patients', `Uploading ${patients.length} patients to Firebase...`);
    for (const p of patients) {
      const docId = String(p.id);
      await setDoc(doc(db, 'patients', docId), {
        ...p,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.patients++;
      processed++;
      if (processed % 25 === 0) report('patients', `Uploaded ${counts.patients}/${patients.length} patients`);
    }

    // 3. Insert Doctors
    report('doctors', `Uploading ${doctors.length} doctors to Firebase...`);
    for (const d of doctors) {
      const docId = String(d.id);
      await setDoc(doc(db, 'doctors', docId), {
        ...d,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.doctors++;
      processed++;
    }

    // 4. Insert Users
    report('users', `Uploading ${users.length} users to Firebase...`);
    for (const u of users) {
      const docId = (u.username || String(u.id)).trim().toLowerCase();
      await setDoc(doc(db, 'users', docId), {
        id: docId,
        username: u.username,
        name: u.name,
        role: u.role,
        login_count: u.login_count || 0,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.users++;
      processed++;
    }

    // 5. Insert Appointments
    report('appointments', `Uploading ${appointments.length} appointments to Firebase...`);
    for (const a of appointments) {
      const docId = String(a.id);
      await setDoc(doc(db, 'appointments', docId), {
        ...a,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.appointments++;
      processed++;
    }

    // 6. Insert Vitals
    report('vitals', `Uploading ${vitals.length} vitals to Firebase...`);
    for (const v of vitals) {
      const docId = String(v.id);
      await setDoc(doc(db, 'vitals', docId), {
        ...v,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.vitals++;
      processed++;
    }

    // 7. Insert Alerts
    report('alerts', `Uploading ${alerts.length} clinical alerts to Firebase...`);
    for (const al of alerts) {
      const docId = String(al.id);
      await setDoc(doc(db, 'alerts', docId), {
        ...al,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.alerts++;
      processed++;
    }

    // 8. Insert Private Data
    report('private_data', `Uploading ${private_data.length} vault records to Firebase...`);
    for (const pr of private_data) {
      const docId = String(pr.id);
      await setDoc(doc(db, 'private_data', docId), {
        ...pr,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.private_data++;
      processed++;
      if (counts.private_data % 50 === 0) report('private_data', `Uploaded ${counts.private_data}/${private_data.length} private records`);
    }

    // 9. Insert Prescriptions
    report('prescriptions', `Uploading ${prescriptions.length} prescriptions to Firebase...`);
    for (const rx of prescriptions) {
      const docId = String(rx.id);
      await setDoc(doc(db, 'prescriptions', docId), {
        ...rx,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.prescriptions++;
      processed++;
    }

    // 10. Insert Pending Lab Results
    report('pending_lab_results', `Uploading ${pending_lab_results.length} lab records to Firebase...`);
    for (const lb of pending_lab_results) {
      const docId = String(lb.id);
      await setDoc(doc(db, 'pending_lab_results', docId), {
        ...lb,
        id: docId,
        syncedAt: new Date().toISOString()
      }, { merge: true });
      counts.pending_lab_results++;
      processed++;
    }

    // 11. Sync Dashboard Stats Summary
    await setDoc(doc(db, 'stats', 'dashboard_summary'), {
      totalPatients: counts.patients,
      totalDoctors: counts.doctors,
      totalUsers: counts.users,
      totalAppointments: counts.appointments,
      totalAlerts: counts.alerts,
      totalVitals: counts.vitals,
      totalPrivateRecords: counts.private_data,
      projectId: "carematrix-b32f0",
      updatedAt: new Date().toISOString()
    }, { merge: true });

    report('completed', `All ${processed} records successfully inserted into Firebase!`);
    console.log('[Firebase] Full database migration to carematrix-b32f0 complete:', counts);
    return { success: true, counts };
  } catch (err: any) {
    console.error('[Firebase] Bulk data insertion error:', err);
    return { 
      success: false, 
      counts, 
      error: err?.message || 'Error inserting data into Firebase' 
    };
  }
}

