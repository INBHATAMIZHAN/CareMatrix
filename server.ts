import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import {
  autoSyncPatient,
  autoDeletePatient,
  autoSyncAppointment,
  autoSyncVital,
  autoSyncPrescription,
  autoSyncAlert,
  autoSyncPrivateData,
  autoDeletePrivateData,
  autoSyncUser
} from "./src/serverFirebaseSync";

dotenv.config();

let genAIClient: GoogleGenAI | null = null;
function getGenAI(customKey?: string): GoogleGenAI {
  const envKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
  const key = (customKey && customKey.trim()) || envKey;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured in server environment");
  }
  return new GoogleGenAI({ 
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } }
  });
}

function initDatabase(): Database.Database {
  const dbPath = path.resolve("cliniq.db");
  try {
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    const check = database.prepare("PRAGMA integrity_check").get() as any;
    if (check && check.integrity_check !== "ok") {
      throw new Error(`Integrity check failed: ${JSON.stringify(check)}`);
    }
    return database;
  } catch (err) {
    console.error("Database initialization or integrity check failed, recreating clean database:", err);
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch (e) {
      console.error("Failed to delete corrupted database file:", e);
    }
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    return database;
  }
}

const db = initDatabase();

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    name TEXT,
    login_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    specialization TEXT,
    department TEXT,
    experience INTEGER,
    phone TEXT
  );

  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    age INTEGER,
    gender TEXT,
    weight REAL,
    blood_group TEXT,
    village TEXT,
    district TEXT,
    allergies TEXT,
    chronic_conditions TEXT,
    past_illness TEXT,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    doctor_name TEXT,
    symptoms TEXT,
    medicines TEXT, -- JSON string
    date TEXT,
    image_data TEXT, -- Base64 for offline storage
    FOREIGN KEY(patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS vitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    bp TEXT,
    weight REAL,
    symptoms TEXT,
    notes TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    recorded_by TEXT,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    type TEXT,
    message TEXT,
    status TEXT DEFAULT 'active',
    severity TEXT DEFAULT 'Moderate',
    assigned_to TEXT,
    follow_up_due TEXT,
    referral_status TEXT DEFAULT 'none',
    resolved_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS private_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id TEXT,
    staff_name TEXT,
    patient_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pending_lab_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    patient_name TEXT,
    staff_id TEXT,
    staff_name TEXT,
    content TEXT,
    image_data TEXT,
    severity TEXT DEFAULT 'Moderate',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    patient_name TEXT,
    doctor_name TEXT,
    doctor_id INTEGER,
    time TEXT,
    reason TEXT,
    date TEXT DEFAULT (date('now', 'localtime')),
    status TEXT DEFAULT 'pending',
    department TEXT,
    diagnosis TEXT,
    treatment TEXT,
    severity TEXT DEFAULT 'mild',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(id),
    FOREIGN KEY(doctor_id) REFERENCES doctors(id)
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER,
    patient_id INTEGER,
    message TEXT,
    type TEXT, -- 'sms' or 'in-app'
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    scheduled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(appointment_id) REFERENCES appointments(id),
    FOREIGN KEY(patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER,
    username TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Add missing columns if they don't exist (Migrations)
function migrate() {
  const tables = ['patients', 'appointments', 'alerts', 'pending_lab_results', 'private_data'];
  tables.forEach(table => {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      const columnNames = columns.map(c => c.name);

      if (table === 'patients') {
        if (!columnNames.includes('gender')) db.exec("ALTER TABLE patients ADD COLUMN gender TEXT");
        if (!columnNames.includes('status')) db.exec("ALTER TABLE patients ADD COLUMN status TEXT DEFAULT 'Active'");
        if (!columnNames.includes('weight')) {
          db.exec("ALTER TABLE patients ADD COLUMN weight REAL");
          // If phone exists, we might want to drop it, but SQLite ALTER TABLE is limited.
          // For simplicity in this environment, we'll just add weight.
        }
        if (!columnNames.includes('village')) db.exec("ALTER TABLE patients ADD COLUMN village TEXT");
        if (!columnNames.includes('district')) db.exec("ALTER TABLE patients ADD COLUMN district TEXT");
      }
      if (table === 'appointments') {
        if (!columnNames.includes('department')) db.exec("ALTER TABLE appointments ADD COLUMN department TEXT");
        if (!columnNames.includes('diagnosis')) db.exec("ALTER TABLE appointments ADD COLUMN diagnosis TEXT");
        if (!columnNames.includes('treatment')) db.exec("ALTER TABLE appointments ADD COLUMN treatment TEXT");
        if (!columnNames.includes('severity')) db.exec("ALTER TABLE appointments ADD COLUMN severity TEXT DEFAULT 'mild'");
        if (!columnNames.includes('doctor_id')) db.exec("ALTER TABLE appointments ADD COLUMN doctor_id INTEGER");
      }
      if (table === 'alerts') {
        if (!columnNames.includes('severity')) db.exec("ALTER TABLE alerts ADD COLUMN severity TEXT DEFAULT 'Moderate'");
        if (!columnNames.includes('assigned_to')) db.exec("ALTER TABLE alerts ADD COLUMN assigned_to TEXT");
        if (!columnNames.includes('follow_up_due')) db.exec("ALTER TABLE alerts ADD COLUMN follow_up_due TEXT");
        if (!columnNames.includes('referral_status')) db.exec("ALTER TABLE alerts ADD COLUMN referral_status TEXT DEFAULT 'none'");
        if (!columnNames.includes('resolved_at')) db.exec("ALTER TABLE alerts ADD COLUMN resolved_at TEXT");
      }
      if (table === 'private_data') {
        if (!columnNames.includes('patient_id')) db.exec("ALTER TABLE private_data ADD COLUMN patient_id INTEGER");
      }
    } catch (e) {
      console.error(`Migration failed for table ${table}:`, e);
    }
  });
}

migrate();

// Seed Data Function
function seedDatabase() {
  const patientCount = db.prepare("SELECT count(*) as count FROM patients").get() as { count: number };
  const doctorCount = db.prepare("SELECT count(*) as count FROM doctors").get() as { count: number };
  const appointmentCount = db.prepare("SELECT count(*) as count FROM appointments").get() as { count: number };
  
  // Ensure critical demo users exist for testing all portals without violating sessions foreign keys
  const ensureDemoUsers = () => {
    try {
      const upsertUser = db.prepare(`
        INSERT INTO users (username, password, name, role) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET 
          password = excluded.password,
          name = excluded.name,
          role = excluded.role
      `);

      upsertUser.run('DR001', 'password123', 'Dr. Suresh Sharma', 'doctor');
      upsertUser.run('dr001', 'password123', 'Dr. Suresh Sharma', 'doctor');
      upsertUser.run('NR001', 'password123', 'Nurse Meena', 'nurse');
      upsertUser.run('nr001', 'password123', 'Nurse Meena', 'nurse');
      upsertUser.run('doctor1', 'password123', 'Dr. Suresh Sharma', 'doctor');
      upsertUser.run('doctor', 'password123', 'Dr. Suresh Sharma', 'doctor');
      upsertUser.run('nurse1', 'password123', 'Nurse Meena', 'nurse');
      upsertUser.run('nurse', 'password123', 'Nurse Meena', 'nurse');
      
      const firstPatient = db.prepare("SELECT * FROM patients ORDER BY id ASC LIMIT 1").get() as any;
      const patientName = firstPatient ? firstPatient.name : 'Ramesh Kumar';
      upsertUser.run('PE001', 'password123', patientName, 'patient');
      upsertUser.run('pe001', 'password123', patientName, 'patient');
      upsertUser.run('patient1', 'password123', patientName, 'patient');
      upsertUser.run('patient', 'password123', patientName, 'patient');
    } catch (err) {
      console.warn("Could not insert demo users:", err);
    }
  };

  // Ensure ALL patients have complete clinical records inside the Private Data Vault
  const ensureAllPatientsInPrivateData = () => {
    try {
      const allPatients = db.prepare("SELECT * FROM patients ORDER BY id ASC").all() as any[];
      const existingCount = db.prepare("SELECT count(*) as count FROM private_data").get() as { count: number };
      
      if (existingCount.count < allPatients.length) {
        console.log(`Syncing all ${allPatients.length} patient details into Private Data Vault...`);
        const checkExisting = db.prepare("SELECT id FROM private_data WHERE patient_id = ?");
        const insertPrivate = db.prepare(
          "INSERT INTO private_data (staff_id, staff_name, patient_id, content, created_at) VALUES (?, ?, ?, ?, ?)"
        );

        const insertAllTx = db.transaction((patients: any[]) => {
          for (const p of patients) {
            const exists = checkExisting.get(p.id);
            if (!exists) {
              const content = `SYNCED PATIENT RECORD\n----------------------\nPatient: ${p.name}\nPatient ID: ${p.id}\nAge: ${p.age} • Gender: ${p.gender || 'N/A'}\nWeight: ${p.weight || 'N/A'} kg\nBlood Group: ${p.blood_group || 'O+'}\nVillage: ${p.village || 'Ralegan Siddhi'} • District: ${p.district || 'Ahmednagar'}\nDisease/Condition: ${p.chronic_conditions || 'None'}\nAllergies: ${p.allergies || 'None'}\nPast Illness: ${p.past_illness || 'None'}\nStatus: ${p.status || 'Active'}\nSynced on: ${p.created_at || new Date().toISOString()}`;
              insertPrivate.run('DR001', 'Dr. Suresh Sharma', p.id, content, p.created_at || new Date().toISOString());
            }
          }
        });

        insertAllTx(allPatients);
        const finalCount = db.prepare("SELECT count(*) as count FROM private_data").get() as { count: number };
        console.log(`Private Data Vault synchronized: ${finalCount.count} records available.`);
      }
    } catch (err) {
      console.warn("Could not sync patients to private data:", err);
    }
  };

  const ensureRuralDemoData = () => {
    try {
      const maharashtraVillages = [
        { village: 'Ralegan Siddhi', district: 'Ahmednagar' },
        { village: 'Hiware Bazar', district: 'Ahmednagar' },
        { village: 'Shirdi', district: 'Ahmednagar' },
        { village: 'Katraj', district: 'Pune' },
        { village: 'Baramati', district: 'Pune' },
        { village: 'Sinnar', district: 'Nashik' },
        { village: 'Trimbak', district: 'Nashik' },
        { village: 'Chiplun', district: 'Ratnagiri' },
        { village: 'Mangaon', district: 'Raigad' }
      ];

      // 1. Backfill village/district for any existing patients missing it
      const unassignedPatients = db.prepare("SELECT id FROM patients WHERE village IS NULL OR village = ''").all() as any[];
      if (unassignedPatients.length > 0) {
        const updateLoc = db.prepare("UPDATE patients SET village = ?, district = ? WHERE id = ?");
        const backfillTx = db.transaction((rows: any[]) => {
          rows.forEach((p, idx) => {
            const loc = maharashtraVillages[idx % maharashtraVillages.length];
            updateLoc.run(loc.village, loc.district, p.id);
          });
        });
        backfillTx(unassignedPatients);
        console.log(`Assigned rural villages to ${unassignedPatients.length} patients.`);
      }

      // 2. Ensure real rural demo active cases exist
      const checkAlertCount = db.prepare("SELECT count(*) as count FROM alerts WHERE status = 'active' AND assigned_to IS NOT NULL").get() as { count: number };
      if (checkAlertCount.count < 10) {
        console.log("Seeding real rural Maharashtra demo active cases...");
        const demoRuralCases = [
          {
            name: "Sunita Ramesh Jadhav", age: 24, gender: "Female", weight: 44, blood_group: "B+",
            village: "Ralegan Siddhi", district: "Ahmednagar",
            type: "Maternal Health Emergency",
            message: "Postpartum Hemorrhage Risk: Severe anemia (Hb 6.8 g/dL) with BP 85/55 mmHg, active bleeding observation.",
            severity: "Critical",
            assigned_to: "ASHA Sunita Tai",
            follow_up_due: new Date().toISOString().split('T')[0],
            referral_status: "District Hospital",
            bp: "85/55",
            symptoms: "Dizziness, pallor, postpartum weakness",
            notes: "Immediate referral to Ahmednagar Civil Hospital with blood transfusion standby."
          },
          {
            name: "Dnyaneshwar Khandu Shinde", age: 48, gender: "Male", weight: 61, blood_group: "O+",
            village: "Sinnar", district: "Nashik",
            type: "Toxicology / Emergency",
            message: "Snake Bite Follow-up (Russell's Viper): Day 3 monitoring, local edema reducing, urine output stable after ASV therapy.",
            severity: "Critical",
            assigned_to: "ASHA Kavita Tai",
            follow_up_due: new Date().toISOString().split('T')[0],
            referral_status: "Rural Hospital",
            bp: "118/76",
            symptoms: "Right leg swelling, cellulitis margin marked",
            notes: "PHC Nashik sub-center follow-up; ensure 20-minute whole blood clotting test (WBCT20)."
          },
          {
            name: "Aarav Santosh Gaikwad", age: 3, gender: "Male", weight: 9.2, blood_group: "A+",
            village: "Hiware Bazar", district: "Ahmednagar",
            type: "Child Malnutrition",
            message: "Severe Acute Malnutrition (SAM): Weight-for-height <-3SD with bilateral pitting pedal edema.",
            severity: "Critical",
            assigned_to: "ASHA Meena Tai",
            follow_up_due: new Date().toISOString().split('T')[0],
            referral_status: "PHC",
            bp: "90/60",
            symptoms: "Lethargy, bilateral foot swelling, poor appetite",
            notes: "Admitted to Nutrition Rehabilitation Centre (NRC) protocol; therapeutic milk F-75 started."
          },
          {
            name: "Tukaram Babanrao Patil", age: 62, gender: "Male", weight: 68, blood_group: "B+",
            village: "Baramati", district: "Pune",
            type: "Cardiovascular Crisis",
            message: "Hypertensive Crisis: BP 200/115 mmHg with headache and blurred vision; urgent titrating IV antihypertensive.",
            severity: "Critical",
            assigned_to: "PHC Nurse Rekha",
            follow_up_due: new Date().toISOString().split('T')[0],
            referral_status: "District Hospital",
            bp: "200/115",
            symptoms: "Severe occipital headache, epistaxis, blurry vision",
            notes: "Transferred via 108 Ambulance to Pune District Hospital ICU."
          },
          {
            name: "Kashibai Mahadev Thorat", age: 58, gender: "Female", weight: 55, blood_group: "O+",
            village: "Shirdi", district: "Ahmednagar",
            type: "Chronic Metabolic",
            message: "Uncontrolled Type 2 Diabetes with Non-healing Foot Ulcer (Wagner Grade 1): RBS 310 mg/dL.",
            severity: "Moderate",
            assigned_to: "ASHA Sunita Tai",
            follow_up_due: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
            referral_status: "PHC",
            bp: "140/90",
            symptoms: "Plantar ulcer right big toe, peripheral neuropathy",
            notes: "Daily saline dressing, oral Metformin + Glimepiride compliance check."
          },
          {
            name: "Pooja Nitin Bhosale", age: 22, gender: "Female", weight: 49, blood_group: "AB+",
            village: "Katraj", district: "Pune",
            type: "Antenatal Risk",
            message: "High BP in Pregnancy (26 weeks): BP 145/95 mmHg, trace proteinuria, mild preeclampsia watch.",
            severity: "Moderate",
            assigned_to: "ASHA Anjali Tai",
            follow_up_due: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            referral_status: "Rural Hospital",
            bp: "145/95",
            symptoms: "Facial puffiness, mild frontal headache",
            notes: "Started Labetalol 100mg BD; weekly biophysical profile."
          },
          {
            name: "Tanaji Pandurang Kadam", age: 41, gender: "Male", weight: 57, blood_group: "A+",
            village: "Sinnar", district: "Nashik",
            type: "Gastroenteritis",
            message: "Severe Dehydration secondary to acute watery gastroenteritis; skin pinch >2 sec, sunken eyes.",
            severity: "Moderate",
            assigned_to: "ASHA Kavita Tai",
            follow_up_due: new Date(Date.now() + 86400000).toISOString().split('T')[0],
            referral_status: "PHC",
            bp: "96/64",
            symptoms: "Vomiting, dry tongue, tachycardia (106 bpm)",
            notes: "RL 2000ml infused at Rural Hospital; continue oral rehydration salts (ORS) zinc."
          },
          {
            name: "Anandi Vitthal Sawant", age: 4, gender: "Female", weight: 11.0, blood_group: "B+",
            village: "Chiplun", district: "Ratnagiri",
            type: "Child Malnutrition",
            message: "Moderate Acute Malnutrition (MAM): MUAC 11.9 cm, recurrent upper respiratory infections.",
            severity: "Moderate",
            assigned_to: "ASHA Sujata Tai",
            follow_up_due: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
            referral_status: "PHC",
            bp: "95/62",
            symptoms: "Loss of muscle mass, lack of weight gain over 3 months",
            notes: "Enrolled in Village Child Development Centre (VCDC) supplementary nutrition."
          },
          {
            name: "Pandhari Nathubhai Pawar", age: 53, gender: "Male", weight: 64, blood_group: "O+",
            village: "Ralegan Siddhi", district: "Ahmednagar",
            type: "Hypertension / NCD",
            message: "Essential Hypertension: Follow-up visit, BP 136/84 on Amlodipine 5mg, low sodium diet compliance good.",
            severity: "Mild",
            assigned_to: "ASHA Sunita Tai",
            follow_up_due: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
            referral_status: "none",
            bp: "136/84",
            symptoms: "Asymptomatic, routine screening",
            notes: "Supply 30-day antihypertensive blister packs via Tele-PHC."
          },
          {
            name: "Radhabai Shamrao Shinde", age: 29, gender: "Female", weight: 51, blood_group: "A+",
            village: "Hiware Bazar", district: "Ahmednagar",
            type: "Maternal Anemia",
            message: "Mild Nutritional Anemia (Hb 10.4 g/dL) in 2nd trimester; IFA tablets provided.",
            severity: "Mild",
            assigned_to: "ASHA Meena Tai",
            follow_up_due: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
            referral_status: "none",
            bp: "112/72",
            symptoms: "Mild fatigue, good fetal movement",
            notes: "Counselled on jaggery, green leafy vegetables, and Vitamin C co-intake."
          },
          {
            name: "Maruti Vithoba Waghmare", age: 67, gender: "Male", weight: 58, blood_group: "B+",
            village: "Shirdi", district: "Ahmednagar",
            type: "Geriatric Care",
            message: "Degenerative Osteoarthritis of Knees: Ambulatory with walking stick, pain controlled on Paracetamol.",
            severity: "Mild",
            assigned_to: "ASHA Sunita Tai",
            follow_up_due: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
            referral_status: "none",
            bp: "128/80",
            symptoms: "Bilateral crepitus, morning stiffness <15 min",
            notes: "Advised low-impact exercises, hot water fermentation."
          },
          {
            name: "Ganesh Baburao Chavan", age: 34, gender: "Male", weight: 59, blood_group: "O+",
            village: "Katraj", district: "Pune",
            type: "Infectious Disease Follow-up",
            message: "Pulmonary Tuberculosis (DOTS Category 1 - Month 3): Sputum conversion negative, weight gain +2.5kg.",
            severity: "Mild",
            assigned_to: "ASHA Anjali Tai",
            follow_up_due: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
            referral_status: "none",
            bp: "120/78",
            symptoms: "Cough resolved, appetite returned",
            notes: "Continuation phase blister packs verified; Nikshay Poshan Yojana assistance credited."
          }
        ];

        const insertPatient = db.prepare(`
          INSERT INTO patients (name, age, gender, weight, blood_group, village, district, allergies, chronic_conditions, past_illness, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
        `);
        const insertAlert = db.prepare(`
          INSERT INTO alerts (patient_id, type, message, status, severity, assigned_to, follow_up_due, referral_status, created_at)
          VALUES (?, ?, ?, 'active', ?, ?, ?, ?, datetime('now', 'localtime'))
        `);
        const insertVitals = db.prepare(`
          INSERT INTO vitals (patient_id, bp, weight, symptoms, notes, recorded_by, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `);
        const insertAppt = db.prepare(`
          INSERT INTO appointments (patient_id, patient_name, doctor_name, time, reason, date, status, severity)
          VALUES (?, ?, 'Dr. Suresh Sharma', '10:00 AM', ?, strftime('%Y-%m-%d', 'now', 'localtime'), 'pending', ?)
        `);

        demoRuralCases.forEach((c) => {
          const pRes = insertPatient.run(
            c.name, c.age, c.gender, c.weight, c.blood_group, c.village, c.district,
            'None', c.type, 'None'
          );
          const pid = pRes.lastInsertRowid;
          insertAlert.run(pid, c.type, c.message, c.severity, c.assigned_to, c.follow_up_due, c.referral_status);
          insertVitals.run(pid, c.bp, c.weight, c.symptoms, c.notes, c.assigned_to);
          insertAppt.run(pid, c.name, c.type, c.severity.toLowerCase());
        });

        console.log("Seeded 12 high-priority rural Maharashtra demo cases successfully.");
      }
    } catch (err) {
      console.warn("Could not ensure rural demo data:", err);
    }
  };

  // If we have patients but no appointments or doctors, the database is likely in a bad state from a failed seed
  if (patientCount.count > 10 && doctorCount.count > 0 && appointmentCount.count > 50) {
    console.log(`Database already has data (Patients: ${patientCount.count}, Doctors: ${doctorCount.count}, Appointments: ${appointmentCount.count}). Skipping seed.`);
    ensureDemoUsers();
    ensureAllPatientsInPrivateData();
    ensureRuralDemoData();
    return;
  }

  console.log("Seeding database with realistic hospital data...");
  
  // Clear existing data to ensure a clean seed if we reached here
  db.exec("DELETE FROM reminders; DELETE FROM appointments; DELETE FROM pending_lab_results; DELETE FROM alerts; DELETE FROM vitals; DELETE FROM prescriptions; DELETE FROM patients; DELETE FROM doctors; DELETE FROM users WHERE role IN ('doctor', 'nurse');");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('patients', 'doctors', 'appointments', 'alerts', 'vitals', 'prescriptions', 'pending_lab_results', 'reminders', 'users');");

  const firstNames = ["Ramesh", "Suresh", "Anita", "Sunita", "Priya", "Rahul", "Amit", "Vikram", "Kavita", "Deepak", "Anjali", "Sanjay", "Meena", "Arjun", "Pooja"];
  const lastNames = ["Kumar", "Sharma", "Patel", "Singh", "Verma", "Gupta", "Reddy", "Nair", "Joshi", "Das", "Mishra", "Yadav"];
  const conditions = ["Diabetes", "Hypertension", "Fever", "Heart Disease", "COVID-like symptoms", "Asthma", "Arthritis", "Migraine", "Thyroid"];
  const departments = ["General Medicine", "Cardiology", "Endocrinology", "Pediatrics", "Neurology", "Orthopedics", "Dermatology"];
  const severities = ["Mild", "Moderate", "Critical"];
  const statuses = ["Active", "Recovered", "Under Observation"];

  // 1. Seed Doctors (30-50)
  const doctors = [];
  for (let i = 1; i <= 40; i++) {
    const name = `Dr. ${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
    const dept = departments[i % departments.length];
    db.prepare("INSERT INTO doctors (name, specialization, department, experience, phone) VALUES (?, ?, ?, ?, ?)").run(
      name, dept, dept, Math.floor(Math.random() * 20) + 5, `+91 90000 ${10000 + i}`
    );
    doctors.push({ id: i, name });
    
    // Also add to users table for login
    db.prepare("INSERT OR IGNORE INTO users (username, password, name, role) VALUES (?, ?, ?, ?)").run(
      `doctor${i}`, "password123", name, "doctor"
    );
  }

  // 2. Seed Patients (300-500)
  for (let i = 1; i <= 400; i++) {
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    const age = Math.floor(Math.random() * 60) + 10;
    const gender = Math.random() > 0.5 ? "Male" : "Female";
    const weight = Math.floor(Math.random() * 40) + 40; // 40-80kg
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    db.prepare("INSERT INTO patients (name, age, gender, weight, blood_group, allergies, chronic_conditions, past_illness, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      name, age, gender, weight, "O+", "None", condition, "None", status
    );
  }

  // 3. Seed Appointments & Visits (150-300)
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  for (let i = 1; i <= 250; i++) {
    const patientId = Math.floor(Math.random() * 400) + 1;
    const doctor = doctors[Math.floor(Math.random() * doctors.length)];
    const patient = db.prepare("SELECT name FROM patients WHERE id = ?").get(patientId) as any;
    
    let date;
    if (i <= 50) date = today;
    else if (i <= 150) date = yesterday;
    else date = tomorrow;

    const time = `${Math.floor(Math.random() * 8) + 9}:00 AM`;
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const status = date === today ? 'pending' : (date === yesterday ? 'completed' : 'pending');

    db.prepare("INSERT INTO appointments (patient_id, patient_name, doctor_name, doctor_id, time, date, reason, status, department, severity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      patientId, patient?.name || "Unknown", doctor.name, doctor.id, time, date, "Regular Checkup", status, "General Medicine", severity.toLowerCase()
    );

    // If completed, add a visit record (diagnosis)
    if (status === 'completed') {
      db.prepare("UPDATE appointments SET diagnosis = ?, treatment = ? WHERE id = ?").run(
        "Common Cold", "Rest and Fluids", i
      );
    }
  }

  // 4. Seed Active Alerts (80-150)
  for (let i = 1; i <= 100; i++) {
    const patientId = Math.floor(Math.random() * 400) + 1;
    const severity = severities[Math.floor(Math.random() * severities.length)];
    db.prepare("INSERT INTO alerts (patient_id, type, message, status, severity) VALUES (?, ?, ?, ?, ?)").run(
      patientId, "Vital Alert", "High Blood Pressure detected", "active", severity
    );
  }

  // 5. Seed Pending Labs
  for (let i = 1; i <= 15; i++) {
    const patientId = Math.floor(Math.random() * 400) + 1;
    const patient = db.prepare("SELECT name FROM patients WHERE id = ?").get(patientId) as any;
    db.prepare("INSERT INTO pending_lab_results (patient_id, patient_name, staff_id, staff_name, content, severity) VALUES (?, ?, ?, ?, ?, ?)").run(
      patientId, patient?.name || "Unknown", "NURSE01", "Nurse Meena", "Blood Test Results Pending", i % 3 === 0 ? "Critical" : "Moderate"
    );
  }

  ensureAllPatientsInPrivateData();

  console.log("Database seeding completed.");
}

seedDatabase();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Security & Password Helpers
  function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  function verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash) return false;
    // Support legacy/seeded plain text passwords
    if (!storedHash.includes(":")) {
      return storedHash === password;
    }
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  }

  // Strict ID Format Regex Patterns
  const ID_PATTERNS = {
    doctor: /^DR[0-9]{3}$/,
    nurse: /^NR[0-9]{3}$/,
    patient: /^PE[0-9]{3}$/
  };

  const ID_FORMAT_ERRORS = {
    doctor: "Invalid Doctor ID. Doctor ID must follow the format DR001.",
    nurse: "Invalid Nurse ID. Nurse ID must follow the format NR001.",
    patient: "Invalid Patient ID. Patient ID must follow the format PE001."
  };

  // API Routes
  app.get("/api/check-id", (req, res) => {
    const { id, role } = req.query as { id?: string; role?: string };
    if (!id || !role || (role !== 'doctor' && role !== 'nurse' && role !== 'patient')) {
      return res.status(400).json({ valid: false, error: "Missing ID or valid role." });
    }
    const cleanId = id.trim();
    const pattern = ID_PATTERNS[role as 'doctor' | 'nurse' | 'patient'];
    if (!pattern.test(cleanId)) {
      return res.json({ valid: false, error: ID_FORMAT_ERRORS[role as 'doctor' | 'nurse' | 'patient'] });
    }
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(cleanId);
    if (existing) {
      const roleLabel = role === 'doctor' ? 'Doctor' : role === 'nurse' ? 'Nurse' : 'Patient';
      return res.json({ valid: false, error: `This ${roleLabel} ID is already registered. Please use a different ID.` });
    }
    res.json({ valid: true });
  });

  app.post("/api/login", (req, res) => {
    const { username, password, portal, requestedPortal, role } = req.body;
    const targetPortal = (portal || requestedPortal || role || '').toString().toLowerCase().trim();

    const cleanUser = (username as string || '').trim();
    const cleanPass = (password as string || '');

    // 1. If the ID or password field is empty:
    if (!cleanUser || !cleanPass) {
      return res.status(400).json({ 
        error: "Please enter your ID and password.",
        field: !cleanUser && !cleanPass ? "both" : !cleanUser ? "username" : "password"
      });
    }

    // 2. If the ID format is wrong:
    const VALID_ID_PATTERN = /^(DR|NR|PE)[0-9]{3}$/;
    if (!VALID_ID_PATTERN.test(cleanUser)) {
      return res.status(400).json({
        error: "Invalid ID format. Use DR001 / NR001 / PE001.",
        field: "username"
      });
    }

    // 3. If the ID is not registered:
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(cleanUser) as any;
    if (!user) {
      return res.status(401).json({ 
        error: "ID not registered. Please register first.",
        canRegister: true,
        field: "username"
      });
    }

    // 4. If the ID is correct and registered but the password is wrong:
    const passwordMatch = verifyPassword(cleanPass, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: "Incorrect password. Please try again.",
        field: "password"
      });
    }

    // If password is plain text, upgrade to secure scrypt hash in background
    if (!user.password.includes(":")) {
      try {
        const upgraded = hashPassword(cleanPass);
        db.prepare("UPDATE users SET password = ? WHERE id = ?").run(upgraded, user.id);
      } catch (e) {
        console.warn("Could not upgrade password hash:", e);
      }
    }

    // 5. If both ID and password are correct but the user is trying to log in through the wrong portal:
    if (targetPortal && user.role !== targetPortal) {
      return res.status(403).json({
        error: "Wrong login portal. Please use the correct login page.",
        suggestedPortal: user.role,
        field: "portal"
      });
    }

    // Increment login count
    db.prepare("UPDATE users SET login_count = login_count + 1 WHERE id = ?").run(user.id);
    const isFirstLogin = user.login_count === 0;

    // Generate cryptographically secure session token
    const token = crypto.randomBytes(32).toString('hex');
    try {
      db.prepare("INSERT INTO sessions (token, user_id, username, role) VALUES (?, ?, ?, ?)").run(
        token,
        user.id,
        user.username,
        user.role
      );
    } catch (sessionErr) {
      console.warn("Could not insert session:", sessionErr);
    }

    let patientId: number | null = null;
    if (user.role === 'patient') {
      const p = db.prepare("SELECT id FROM patients WHERE name = ? COLLATE NOCASE").get(user.name) as any;
      if (p) {
        patientId = p.id;
      } else {
        const firstP = db.prepare("SELECT id FROM patients ORDER BY id ASC LIMIT 1").get() as any;
        if (firstP) patientId = firstP.id;
      }
    }

    res.json({
      token,
      id: user.id,
      patientId: patientId || user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      isFirstLogin
    });
  });

  app.post("/api/register", (req, res) => {
    let { username, password, name, role, hospitalCode } = req.body;
    
    // Restriction: Only Doctor, Nurse and Patient can register
    if (role !== 'doctor' && role !== 'nurse' && role !== 'patient') {
      return res.status(403).json({ error: "Only Doctors, Nurses and Patients can register via this portal." });
    }

    if (!username || typeof username !== 'string' || !username.trim()) {
      const errorMsg = role === 'doctor' ? ID_FORMAT_ERRORS.doctor :
                       role === 'nurse' ? ID_FORMAT_ERRORS.nurse :
                       ID_FORMAT_ERRORS.patient;
      return res.status(400).json({ error: errorMsg });
    }

    const cleanUsername = username.trim();

    // Strict ID-Format Validation: DR001-DR999, NR001-NR999, PE001-PE999
    const pattern = ID_PATTERNS[role as 'doctor' | 'nurse' | 'patient'];
    if (!pattern.test(cleanUsername)) {
      return res.status(400).json({ error: ID_FORMAT_ERRORS[role as 'doctor' | 'nurse' | 'patient'] });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: "Full Name is required for registration." });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ error: "Password is required for registration." });
    }

    // Hospital Code validation for staff registration
    if (role === 'doctor' || role === 'nurse') {
      if (!hospitalCode || typeof hospitalCode !== 'string' || !hospitalCode.trim()) {
        return res.status(400).json({ error: "Hospital Code is required for staff registration." });
      }
      if (hospitalCode.trim() !== 'inba123') {
        return res.status(403).json({ error: "Invalid Hospital Code. Access Denied." });
      }
    }

    // Check duplicate ID at backend/database level
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(cleanUsername);
    if (existing) {
      const roleLabel = role === 'doctor' ? 'Doctor' : role === 'nurse' ? 'Nurse' : 'Patient';
      return res.status(409).json({ error: `This ${roleLabel} ID is already registered. Please use a different ID.` });
    }

    try {
      const hashedPassword = hashPassword(password.trim());
      const result = db.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)").run(
        cleanUsername,
        hashedPassword,
        name.trim(),
        role
      );

      // If a patient registers, ensure a patient profile exists in patients table
      if (role === 'patient') {
        try {
          const existingPatient = db.prepare("SELECT id FROM patients WHERE name = ?").get(name.trim());
          if (!existingPatient) {
            db.prepare("INSERT INTO patients (name, age, gender, weight, blood_group, allergies, chronic_conditions, past_illness) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
              name.trim(),
              35,
              'Other',
              65,
              'O+',
              'None',
              'None',
              'None'
            );
          }
        } catch (patErr) {
          console.warn("Could not insert patient record:", patErr);
        }
      }

      res.json({ id: result.lastInsertRowid, username: cleanUsername, name: name.trim(), role });
    } catch (e: any) {
      if (e.message && e.message.includes("UNIQUE constraint failed")) {
        const roleLabel = role === 'doctor' ? 'Doctor' : role === 'nurse' ? 'Nurse' : 'Patient';
        res.status(409).json({ error: `This ${roleLabel} ID is already registered. Please use a different ID.` });
      } else {
        res.status(500).json({ error: e.message || "Registration failed" });
      }
    }
  });

  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.substring(7).trim();
    const session = db.prepare("SELECT user_id, username, role FROM sessions WHERE token = ?").get(token) as any;
    if (!session) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    const user = db.prepare("SELECT id, username, name, role, login_count FROM users WHERE id = ?").get(session.user_id) as any;
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    let patientId: number | null = null;
    if (user.role === 'patient') {
      const p = db.prepare("SELECT id FROM patients WHERE name = ? COLLATE NOCASE").get(user.name) as any;
      if (p) {
        patientId = p.id;
      } else {
        const firstP = db.prepare("SELECT id FROM patients ORDER BY id ASC LIMIT 1").get() as any;
        if (firstP) patientId = firstP.id;
      }
    }
    res.json({ ...user, patientId: patientId || user.id, token });
  });

  app.post("/api/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    res.json({ success: true });
  });

  // Shared function: today's visits = unique patients who had an appointment, vitals, prescription, or private record dated today
  function getTodaysVisits() {
    return db.prepare(`
      SELECT 
        p.id as patient_id,
        p.name as patient_name,
        p.age,
        p.gender,
        COALESCE(p.weight, v_sub.weight, 54) as weight,
        COALESCE(p.village, 'Ralegan Siddhi') as village,
        COALESCE(p.district, 'Ahmednagar') as district,
        act.activity_date as date,
        act.activity_time as time,
        act.reason
      FROM patients p
      JOIN (
        SELECT 
          patient_id,
          MAX(act_timestamp) as latest_ts,
          activity_date,
          activity_time,
          reason
        FROM (
          SELECT 
            patient_id, 
            date || ' ' || time as act_timestamp, 
            date as activity_date, 
            time as activity_time,
            COALESCE(reason, 'Appointment') as reason
          FROM appointments 
          WHERE date = strftime('%Y-%m-%d', 'now', 'localtime') AND patient_id IS NOT NULL

          UNION ALL

          SELECT 
            patient_id, 
            recorded_at as act_timestamp, 
            strftime('%Y-%m-%d', recorded_at) as activity_date, 
            strftime('%H:%M', recorded_at) as activity_time,
            'Vitals Check' as reason
          FROM vitals 
          WHERE date(recorded_at) = strftime('%Y-%m-%d', 'now', 'localtime') AND patient_id IS NOT NULL

          UNION ALL

          SELECT 
            patient_id, 
            date || ' 10:00:00' as act_timestamp, 
            date as activity_date, 
            '10:00 AM' as activity_time,
            'Prescription' as reason
          FROM prescriptions 
          WHERE date = strftime('%Y-%m-%d', 'now', 'localtime') AND patient_id IS NOT NULL

          UNION ALL

          SELECT 
            patient_id, 
            created_at as act_timestamp, 
            strftime('%Y-%m-%d', created_at) as activity_date, 
            strftime('%H:%M', created_at) as activity_time,
            'Clinical Record' as reason
          FROM private_data 
          WHERE date(created_at) = strftime('%Y-%m-%d', 'now', 'localtime') AND patient_id IS NOT NULL
        )
        GROUP BY patient_id
      ) act ON p.id = act.patient_id
      LEFT JOIN (
        SELECT patient_id, weight FROM vitals GROUP BY patient_id HAVING MAX(recorded_at)
      ) v_sub ON p.id = v_sub.patient_id
      ORDER BY act.latest_ts DESC
    `).all();
  }

  app.get("/api/patients/all", (req, res) => {
    const { q } = req.query;
    let query = `
      SELECT p.*, 
        COALESCE(
          (SELECT MAX(d) FROM (
            SELECT date as d FROM prescriptions WHERE patient_id = p.id
            UNION
            SELECT date as d FROM appointments WHERE patient_id = p.id
          )),
          (SELECT strftime('%Y-%m-%d', MAX(recorded_at)) FROM vitals WHERE patient_id = p.id),
          (SELECT strftime('%Y-%m-%d', MAX(created_at)) FROM private_data WHERE patient_id = p.id),
          strftime('%Y-%m-%d', p.created_at),
          strftime('%Y-%m-%d', 'now', 'localtime')
        ) as last_visit
      FROM patients p
    `;
    let params: any[] = [];

    if (q) {
      query += ` WHERE p.name LIKE ? OR p.id = ?`;
      params = [`%${q}%`, q];
    }

    query += ` ORDER BY p.name ASC`;

    const patients = db.prepare(query).all(...params);
    res.json(patients);
  });

  app.get("/api/visits/all", (req, res) => {
    const visits = getTodaysVisits();
    res.json(visits);
  });

  // Active Cases Endpoint for Rural Healthcare Priority Queue
  app.get("/api/active-cases", (req, res) => {
    try {
      const cases = db.prepare(`
        SELECT 
          a.id,
          a.patient_id,
          a.type,
          a.message,
          a.status,
          COALESCE(a.severity, 'Moderate') as severity,
          COALESCE(a.assigned_to, 'ASHA Sunita Tai') as assigned_to,
          COALESCE(a.follow_up_due, strftime('%Y-%m-%d', 'now', '+1 day')) as follow_up_due,
          COALESCE(a.referral_status, 'none') as referral_status,
          a.resolved_at,
          a.created_at,
          p.name as patient_name,
          p.age,
          p.gender,
          COALESCE(p.weight, v.weight, 52) as weight,
          COALESCE(p.village, 'Ralegan Siddhi') as village,
          COALESCE(p.district, 'Ahmednagar') as district,
          COALESCE(v.bp, '120/80') as bp,
          COALESCE(v.symptoms, p.chronic_conditions, 'Under Observation') as symptoms
        FROM alerts a
        JOIN patients p ON a.patient_id = p.id
        LEFT JOIN (
          SELECT patient_id, bp, weight, symptoms, MAX(recorded_at) 
          FROM vitals 
          GROUP BY patient_id
        ) v ON p.id = v.patient_id
        WHERE a.status = 'active' OR a.status IS NULL
        ORDER BY 
          CASE 
            WHEN a.severity IN ('Critical', 'High') THEN 1
            WHEN a.severity = 'Moderate' THEN 2
            ELSE 3
          END,
          a.created_at DESC
      `).all();
      res.json(cases);
    } catch (e: any) {
      console.error("Error fetching active cases:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Update alert status, assigned ASHA worker, or referral level
  app.patch("/api/alerts/:id", (req, res) => {
    const alertId = req.params.id;
    const { status, assigned_to, referral_status, follow_up_due } = req.body;
    try {
      const current = db.prepare("SELECT * FROM alerts WHERE id = ?").get(alertId) as any;
      if (!current) return res.status(404).json({ error: "Alert not found" });

      const newStatus = status !== undefined ? status : current.status;
      const newAssigned = assigned_to !== undefined ? assigned_to : current.assigned_to;
      const newReferral = referral_status !== undefined ? referral_status : current.referral_status;
      const newFollowUp = follow_up_due !== undefined ? follow_up_due : current.follow_up_due;
      const resolvedAt = newStatus === 'resolved' ? (current.resolved_at || new Date().toISOString()) : null;

      db.prepare(`
        UPDATE alerts 
        SET status = ?, assigned_to = ?, referral_status = ?, follow_up_due = ?, resolved_at = ?
        WHERE id = ?
      `).run(newStatus, newAssigned, newReferral, newFollowUp, resolvedAt, alertId);

      res.json({ success: true, id: alertId, status: newStatus });
    } catch (e: any) {
      console.error("Error updating alert:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/active-cases/insights", (req, res) => {
    try {
      const activePatients = db.prepare("SELECT count(DISTINCT patient_id) as count FROM alerts WHERE status = 'active'").get() as { count: number };
      
      const activeCasesByVillage = db.prepare(`
        SELECT COALESCE(p.village, 'Ralegan Siddhi') as village, count(*) as count 
        FROM alerts a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.status = 'active'
        GROUP BY COALESCE(p.village, 'Ralegan Siddhi')
        ORDER BY count DESC
        LIMIT 8
      `).all();

      const highRiskGeography = db.prepare(`
        SELECT 
          COALESCE(p.village, 'Ralegan Siddhi') as village,
          COALESCE(p.district, 'Ahmednagar') as district,
          SUM(CASE WHEN a.severity IN ('Critical', 'High') THEN 1 ELSE 0 END) as criticalCount,
          count(*) as totalCount
        FROM alerts a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.status = 'active'
        GROUP BY COALESCE(p.village, 'Ralegan Siddhi'), COALESCE(p.district, 'Ahmednagar')
        ORDER BY criticalCount DESC, totalCount DESC
        LIMIT 3
      `).all();

      const severityDistribution = db.prepare(`
        SELECT 
          CASE 
            WHEN severity IN ('Critical', 'High') THEN 'Critical'
            WHEN severity = 'Moderate' THEN 'Moderate'
            ELSE 'Mild'
          END as severity,
          count(*) as count 
        FROM alerts 
        WHERE status = 'active'
        GROUP BY 
          CASE 
            WHEN severity IN ('Critical', 'High') THEN 'Critical'
            WHEN severity = 'Moderate' THEN 'Moderate'
            ELSE 'Mild'
          END
      `).all();

      const commonConditions = db.prepare(`
        SELECT chronic_conditions as condition, count(*) as count 
        FROM patients 
        WHERE chronic_conditions IS NOT NULL AND chronic_conditions != ''
        GROUP BY chronic_conditions
        ORDER BY count DESC
        LIMIT 5
      `).all();

      res.json({
        activePatients: activePatients.count,
        activeCasesByVillage,
        highRiskGeography,
        severityDistribution,
        commonConditions
      });
    } catch (e: any) {
      console.error("Error fetching active cases insights:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stats", (req, res) => {
    try {
      const totalPatients = db.prepare("SELECT count(*) as count FROM patients").get() as { count: number };
      const todaysVisitsList = getTodaysVisits();
      const activeCases = db.prepare("SELECT count(DISTINCT patient_id) as count FROM alerts WHERE status = 'active'").get() as { count: number };
      const pendingLabs = db.prepare("SELECT count(*) as count FROM pending_lab_results").get() as { count: number };
      
      const doctorName = req.query.doctor_name as string;
      let todayAppointments = 0;
      if (doctorName) {
        const apptCount = db.prepare("SELECT count(*) as count FROM appointments WHERE doctor_name = ? AND date = strftime('%Y-%m-%d', 'now', 'localtime')").get(doctorName) as any;
        todayAppointments = apptCount?.count || 0;
      } else {
        const apptCount = db.prepare("SELECT count(*) as count FROM appointments WHERE date = strftime('%Y-%m-%d', 'now', 'localtime')").get() as any;
        todayAppointments = apptCount?.count || 0;
      }

      const stats = {
        totalPatients: totalPatients.count || 0,
        todayVisits: todaysVisitsList.length,
        activeCases: activeCases.count || 0,
        pendingLabs: pendingLabs.count || 0,
        todayAppointments
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/doctors", (req, res) => {
    const doctors = db.prepare("SELECT name FROM users WHERE role = 'doctor'").all();
    res.json(doctors);
  });

  app.get("/api/appointments", (req, res) => {
    const doctorName = req.query.doctor_name as string;
    let appointments;
    if (doctorName) {
      appointments = db.prepare("SELECT * FROM appointments WHERE doctor_name = ? AND date = date('now', 'localtime') ORDER BY time ASC").all(doctorName);
    } else {
      appointments = db.prepare("SELECT * FROM appointments WHERE date = date('now', 'localtime') ORDER BY time ASC").all();
    }
    res.json(appointments);
  });

  app.post("/api/appointments", (req, res) => {
    const { patientId, patientName, doctorName, time, reason } = req.body;
    if (!patientName || !doctorName || !time) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const result = db.prepare("INSERT INTO appointments (patient_id, patient_name, doctor_name, time, reason) VALUES (?, ?, ?, ?, ?)").run(
      patientId || null,
      patientName,
      doctorName,
      time,
      reason
    );
    
    const appointmentId = result.lastInsertRowid;

    // Automatically sync appointment to Firebase Firestore
    autoSyncAppointment({
      id: appointmentId,
      patient_id: patientId || null,
      patient_name: patientName,
      doctor_name: doctorName,
      time,
      reason,
      date: req.body.date || new Date().toISOString().split('T')[0],
      status: 'scheduled'
    });

    // Auto-schedule a reminder if patientId is provided
    if (patientId) {
      const message = `Reminder: You have an appointment with ${doctorName} at ${time} on ${req.body.date || 'today'}.`;
      db.prepare("INSERT INTO reminders (appointment_id, patient_id, message, type, scheduled_at) VALUES (?, ?, ?, ?, ?)").run(
        appointmentId,
        patientId,
        message,
        'in-app',
        req.body.date || new Date().toISOString().split('T')[0]
      );
    }

    res.json({ success: true, id: appointmentId });
  });

  app.put("/api/appointments/:id", (req, res) => {
    try {
      const { status, time, reason, doctorName, date } = req.body;
      const apptId = req.params.id;
      db.prepare(`
        UPDATE appointments
        SET status = COALESCE(?, status),
            time = COALESCE(?, time),
            reason = COALESCE(?, reason),
            doctor_name = COALESCE(?, doctor_name),
            date = COALESCE(?, date)
        WHERE id = ?
      `).run(status, time, reason, doctorName, date, apptId);

      const updated = db.prepare("SELECT * FROM appointments WHERE id = ?").get(apptId);
      if (updated) {
        autoSyncAppointment(updated);
      }
      res.json({ success: true, appointment: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/appointments/:id", (req, res) => {
    try {
      const apptId = req.params.id;
      db.prepare("DELETE FROM appointments WHERE id = ?").run(apptId);
      autoDeletePatient(apptId); // cleans up appointment doc
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/reminders", (req, res) => {
    const { patient_id } = req.query;
    let reminders;
    if (patient_id) {
      reminders = db.prepare("SELECT * FROM reminders WHERE patient_id = ? ORDER BY created_at DESC").all(patient_id);
    } else {
      reminders = db.prepare("SELECT * FROM reminders ORDER BY created_at DESC").all();
    }
    res.json(reminders);
  });

  app.post("/api/reminders/send-sms", (req, res) => {
    const { patient_id, message } = req.body;
    // SMS reminder is now disabled as phone is removed
    res.status(400).json({ error: "SMS reminders are disabled as phone numbers are no longer stored." });
  });

  app.get("/api/recent-activity", (req, res) => {
    try {
      const activities: any[] = [];
      
      // 1. Recent Prescriptions
      const prescriptions = db.prepare(`
        SELECT 'prescription' as type, id, doctor_name as user, patient_id, date as time, 'Prescription sent for Patient #' || patient_id as message
        FROM prescriptions 
        ORDER BY id DESC LIMIT 5
      `).all() as any[];
      activities.push(...prescriptions.map(p => ({ ...p, id: `prescription-${p.id}` })));

      // 2. Recent Vitals
      const vitals = db.prepare(`
        SELECT 'vitals' as type, id, recorded_by as user, patient_id, recorded_at as time, recorded_by || ' updated Patient #' || patient_id || ' vitals' as message
        FROM vitals 
        ORDER BY id DESC LIMIT 5
      `).all() as any[];
      activities.push(...vitals.map(v => ({ ...v, id: `vitals-${v.id}` })));

      // 3. Recent Lab Results
      const labs = db.prepare(`
        SELECT 'lab' as type, id, staff_name as user, patient_id, created_at as time, 'Lab Result received: Patient #' || patient_id as message
        FROM pending_lab_results 
        ORDER BY id DESC LIMIT 5
      `).all() as any[];
      activities.push(...labs.map(l => ({ ...l, id: `lab-${l.id}` })));

      // 4. Recent Appointments
      const appts = db.prepare(`
        SELECT 'appointment' as type, id, doctor_name as user, 0 as patient_id, created_at as time, 'New appointment: ' || patient_name as message
        FROM appointments 
        ORDER BY id DESC LIMIT 5
      `).all() as any[];
      activities.push(...appts.map(a => ({ ...a, id: `appointment-${a.id}` })));

      // Sort all by time descending
      activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      res.json(activities.slice(0, 10));
    } catch (err: any) {
      console.warn("Could not query recent activity:", err);
      res.json([]);
    }
  });

  app.get("/api/patients", (req, res) => {
    const patients = db.prepare("SELECT * FROM patients ORDER BY created_at DESC").all();
    res.json(patients);
  });

  app.get("/api/patients/search", (req, res) => {
    const searchTerm = ((req.query.q || req.query.query || '') as string).trim();
    if (!searchTerm) {
      return res.json([]);
    }
    const patients = db.prepare("SELECT * FROM patients WHERE name LIKE ? OR id = ?").all(`%${searchTerm}%`, searchTerm);
    res.json(patients);
  });

  app.get("/api/patients/:id", (req, res) => {
    let patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(req.params.id);
    let resolvedId = req.params.id;
    if (!patient) {
      // Check if this ID is a user id
      const user = db.prepare("SELECT name, role FROM users WHERE id = ?").get(req.params.id) as any;
      if (user && user.name) {
        patient = db.prepare("SELECT * FROM patients WHERE name = ? COLLATE NOCASE").get(user.name);
        if (patient) resolvedId = (patient as any).id;
      }
    }
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    const prescriptions = db.prepare("SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY date DESC").all(resolvedId);
    const vitals = db.prepare("SELECT * FROM vitals WHERE patient_id = ? ORDER BY recorded_at DESC").all(resolvedId);
    const alerts = db.prepare("SELECT * FROM alerts WHERE patient_id = ? AND status = 'active'").all(resolvedId);
    res.json({ ...patient as any, prescriptions, vitals, alerts });
  });

  app.post("/api/patients", (req, res) => {
    const { name, age, gender, weight, blood_group, allergies, chronic_conditions, past_illness, village, district } = req.body;
    try {
      const patientVillage = village || 'Ralegan Siddhi';
      const patientDistrict = district || 'Ahmednagar';
      const result = db.prepare("INSERT INTO patients (name, age, gender, weight, blood_group, village, district, allergies, chronic_conditions, past_illness) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(name, age, gender, weight, blood_group, patientVillage, patientDistrict, allergies, chronic_conditions, past_illness);
      const newId = result.lastInsertRowid;
      
      // Auto store patient details in Private Data Vault
      try {
        const privateContent = `SYNCED PATIENT RECORD\n----------------------\nPatient: ${name}\nPatient ID: ${newId}\nAge: ${age} • Gender: ${gender || 'N/A'}\nWeight: ${weight || 'N/A'} kg\nBlood Group: ${blood_group || 'O+'}\nVillage: ${patientVillage} • District: ${patientDistrict}\nDisease/Condition: ${chronic_conditions || 'None'}\nAllergies: ${allergies || 'None'}\nPast Illness: ${past_illness || 'None'}\nStatus: Active\nSynced on: ${new Date().toISOString()}`;
        db.prepare("INSERT INTO private_data (staff_id, staff_name, patient_id, content) VALUES (?, ?, ?, ?)").run('DR001', 'Dr. Suresh Sharma', newId, privateContent);
      } catch (vaultErr) {
        console.warn("Could not insert into private_data:", vaultErr);
      }

      // Record today's visit/intake so it reflects in today's visits immediately
      try {
        db.prepare("INSERT INTO vitals (patient_id, bp, weight, symptoms, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?)").run(
          newId,
          '120/80',
          parseFloat(weight) || 65,
          chronic_conditions || 'Initial Registration Intake',
          `Intake recorded on registration. Blood group: ${blood_group || 'O+'}`,
          'Dr. Suresh Sharma'
        );
      } catch (vitalsErr) {
        console.warn("Could not insert initial intake vitals:", vitalsErr);
      }

      // Automatically sync patient record to Firebase Firestore in real time
      autoSyncPatient({
        id: newId,
        name,
        age: Number(age) || 0,
        gender: gender || 'Other',
        weight: Number(weight) || 0,
        blood_group: blood_group || 'O+',
        village: patientVillage,
        district: patientDistrict,
        allergies: allergies || 'None',
        chronic_conditions: chronic_conditions || 'None',
        past_illness: past_illness || 'None',
        status: 'Active'
      });

      // Auto-sync private data vault entry
      autoSyncPrivateData({
        id: `PV-${newId}`,
        staff_id: 'DR001',
        staff_name: 'Dr. Suresh Sharma',
        patient_id: newId,
        content: `SYNCED PATIENT RECORD\n----------------------\nPatient: ${name}\nPatient ID: ${newId}\nAge: ${age} • Gender: ${gender || 'N/A'}\nWeight: ${weight || 'N/A'} kg\nBlood Group: ${blood_group || 'O+'}\nVillage: ${patientVillage} • District: ${patientDistrict}\nDisease/Condition: ${chronic_conditions || 'None'}\nAllergies: ${allergies || 'None'}\nPast Illness: ${past_illness || 'None'}\nStatus: Active\nSynced on: ${new Date().toISOString()}`
      });

      res.json({ id: newId });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/patients/:id", (req, res) => {
    try {
      const { name, age, gender, weight, blood_group, village, district, allergies, chronic_conditions, past_illness, status } = req.body;
      const patientId = req.params.id;
      db.prepare(`
        UPDATE patients 
        SET name = COALESCE(?, name),
            age = COALESCE(?, age),
            gender = COALESCE(?, gender),
            weight = COALESCE(?, weight),
            blood_group = COALESCE(?, blood_group),
            village = COALESCE(?, village),
            district = COALESCE(?, district),
            allergies = COALESCE(?, allergies),
            chronic_conditions = COALESCE(?, chronic_conditions),
            past_illness = COALESCE(?, past_illness),
            status = COALESCE(?, status)
        WHERE id = ?
      `).run(name, age, gender, weight, blood_group, village, district, allergies, chronic_conditions, past_illness, status, patientId);

      const updated = db.prepare("SELECT * FROM patients WHERE id = ?").get(patientId);
      if (updated) {
        autoSyncPatient(updated);
      }
      res.json({ success: true, patient: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/patients/:id", (req, res) => {
    try {
      const patientId = req.params.id;
      db.prepare("DELETE FROM patients WHERE id = ?").run(patientId);
      autoDeletePatient(patientId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const getValidPatientId = (id: any) => {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) return 1;
    const exists = db.prepare("SELECT id FROM patients WHERE id = ?").get(parsedId);
    return exists ? parsedId : 1;
  };

  app.post("/api/extract-prescription", async (req, res) => {
    try {
      const { image, base64Image, apiKey: clientApiKey } = req.body;
      const rawImage = image || base64Image;
      if (!rawImage) {
        return res.status(400).json({ error: "No image provided" });
      }

      let mimeType = "image/jpeg";
      let base64Data = rawImage;
      if (rawImage.includes(";base64,")) {
        const parts = rawImage.split(";base64,");
        const mimeMatch = parts[0].match(/data:(image\/[a-zA-Z0-9\+\-]+)/);
        if (mimeMatch) {
          mimeType = mimeMatch[1];
        }
        base64Data = parts[1];
      } else if (rawImage.includes(",")) {
        base64Data = rawImage.split(",")[1];
      }

      // Strip all whitespace and line breaks from base64 string
      base64Data = base64Data.replace(/[\r\n\s]+/g, "");

      const customKey = (req.headers["x-gemini-key"] as string) || clientApiKey;
      let ai: GoogleGenAI;
      try {
        ai = getGenAI(customKey);
      } catch (keyErr: any) {
        console.warn("[API /extract-prescription] Gemini API key not configured:", keyErr?.message || keyErr);
        return res.json({
          patientName: "",
          gender: "Not specified",
          age: 0,
          weight: 0,
          bloodGroup: "",
          bp: "",
          doctorName: "",
          date: new Date().toISOString().split("T")[0],
          symptoms: "",
          medicines: [],
          error: "Gemini API key is not configured on server"
        });
      }

      const prompt = `You are an expert clinical document extraction specialist. Analyze this medical prescription or clinic intake document image with absolute clinical precision.

CRITICAL PRIORITY: PATIENT NAME
- Look carefully for the patient's personal name (examine headers, "Patient Name:", "Pt Name:", "Patient:", "Name:", "Pt:", "Mr.", "Mrs.", "Ms.", "Master", "Baby", "S/o", "D/o", "W/o", or handwritten names).
- Extract the person's actual name (e.g., "Anita Sharma", "Rajesh Kumar", "David Smith").
- DO NOT return generic placeholder text like "Patient Record", "Patient Record instance", "Patient", "Record", "Instance", "General Intake", "Prescription", "OPD", or "Rx". If no genuine person name is found, return an empty string "".

CRITICAL PRIORITY: EXHAUSTIVE MEDICINE EXTRACTION (EXTRACT ALL MEDICINES)
- You MUST extract ALL prescribed medicines found anywhere on this prescription. Do NOT omit, truncate, sample, or cap the list.
- Whether there is 1 medication, 3 medications, 5 medications, 8 medications, or 12+ medications, extract EVERY SINGLE ONE of them as individual entries in the "medicines" array.
- DO NOT default or limit the output to 3 medicines. The list must be completely exhaustive and mirror all medications written in the prescription.
- Clean medication names: strip prefixes like "Tab.", "Cap.", "Syp.", "Inj.", "Oint." so the clean medicine name is stored in "name" (e.g. "Azithromycin" instead of "Tab. Azithromycin", "Dolo 650" instead of "Tab Dolo 650mg").
- For each medicine, extract:
  * name: Clean brand or generic medication name
  * dosage: Strength or dose (e.g., "650mg", "500mg", "40mg", "10ml", "1 puff")
  * frequency: Dosage schedule (e.g., "1-0-1", "1-0-0", "0-0-1", "TDS", "BD", "OD", "HS", "SOS", "Twice daily", "At bedtime")
  * duration: Duration (e.g., "3 days", "5 days", "10 days", "1 month", "Continue")
  * instructions: Specific directions (e.g., "After meals", "Before breakfast", "With warm water", "SOS for fever")

EXTRACT ALL OTHER CLINICAL FIELDS:
- age: Patient age as a positive integer number (0 if not found)
- gender: "Male", "Female", or "Other" (empty string if not found)
- weight: Patient weight in kg as number (0 if not found)
- bloodGroup: Blood group such as "A+", "B+", "O+", "AB+", "A-", "B-", "O-", "AB-" (empty string if not found)
- bp: Blood pressure reading e.g. "120/80" (empty string if not found)
- doctorName: Attending doctor's name with prefix e.g. "Dr. Suresh Sharma"
- date: Date on prescription in YYYY-MM-DD format (or current date if not found)
- symptoms: Chief complaint, symptoms or provisional diagnosis

Return structured JSON according to the schema.`;

      // Use gemini-3.1-flash-lite as primary high-speed vision model, followed by gemini-flash-latest and gemini-3.8-flash
      const modelsToTry = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
      let extractionResult: any = null;
      let lastError: any = null;

      const prescriptionSchema = {
        type: Type.OBJECT,
        properties: {
          patientName: { type: Type.STRING, description: "Actual person's name. Never return 'Patient Record'." },
          gender: { type: Type.STRING },
          age: { type: Type.NUMBER },
          weight: { type: Type.NUMBER },
          bloodGroup: { type: Type.STRING },
          bp: { type: Type.STRING },
          doctorName: { type: Type.STRING },
          date: { type: Type.STRING },
          symptoms: { type: Type.STRING },
          medicines: {
            type: Type.ARRAY,
            description: "Complete and exhaustive list of ALL prescribed medicines on the document without omission",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                dosage: { type: Type.STRING },
                frequency: { type: Type.STRING },
                duration: { type: Type.STRING },
                instructions: { type: Type.STRING }
              }
            }
          }
        }
      };

      for (const model of modelsToTry) {
        const timeoutMs = 38000;
        const executeModelCall = async () => {
          const callPromise = ai.models.generateContent({
            model,
            contents: {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data
                  }
                }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: prescriptionSchema
            }
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${model} extraction timed out (${timeoutMs / 1000}s)`)), timeoutMs)
          );

          return (await Promise.race([callPromise, timeoutPromise])) as any;
        };

        try {
          const modelStartTime = Date.now();
          let response: any = null;
          try {
            response = await executeModelCall();
          } catch (firstErr: any) {
            const is503 = firstErr?.status === 503 || firstErr?.message?.includes("503") || firstErr?.message?.includes("high demand") || firstErr?.message?.includes("UNAVAILABLE");
            if (is503) {
              console.warn(`[API /extract-prescription] ${model} hit temporary 503 high demand spike, retrying once after 800ms backoff...`);
              await new Promise((r) => setTimeout(r, 800));
              response = await executeModelCall();
            } else {
              throw firstErr;
            }
          }

          if (response?.text) {
            let text = response.text.trim();
            if (text.startsWith("```")) {
              text = text.replace(/^```[a-z]*\n/i, "").replace(/\n?```$/i, "").trim();
            }
            const parsed = JSON.parse(text);
            if (parsed.patientName) {
              const cleaned = parsed.patientName.trim();
              if (/^(patient record|patient record instance|patient|record|instance|general intake|rx|opd|prescription)$/i.test(cleaned)) {
                parsed.patientName = "";
              } else {
                parsed.patientName = cleaned;
              }
            }
            if (!Array.isArray(parsed.medicines)) {
              parsed.medicines = [];
            }
            console.log(`[API /extract-prescription] Successfully extracted ${parsed.medicines.length} medicine(s) with ${model} in ${Date.now() - modelStartTime}ms`);
            extractionResult = parsed;
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[API /extract-prescription] ${model} attempt failed (${err?.message || err}), trying next model...`);
        }
      }

      if (extractionResult) {
        return res.json(extractionResult);
      }

      // If AI model was unreachable or experienced temporary 503 spikes, return empty structure
      // NEVER return fake dummy medicines (Paracetamol, Amoxicillin, Cetirizine)!
      console.warn("[API /extract-prescription] Models failed, returning clean empty structure for OCR fallback:", lastError?.message || lastError);
      return res.json({
        patientName: "",
        gender: "Not specified",
        age: 0,
        weight: 0,
        bloodGroup: "",
        bp: "",
        doctorName: "",
        date: new Date().toISOString().split("T")[0],
        symptoms: "",
        medicines: [],
        error: lastError?.message || "AI extraction unavailable"
      });
    } catch (e: any) {
      console.error("[API /extract-prescription] Error:", e?.message || e);
      res.status(500).json({ error: e?.message || "Prescription extraction failed" });
    }
  });

  app.post("/api/prescriptions", (req, res) => {
    const { patient_id, doctor_name, symptoms, medicines, date, image_data } = req.body;
    const sanitizedPatientId = getValidPatientId(patient_id);
    const result = db.prepare("INSERT INTO prescriptions (patient_id, doctor_name, symptoms, medicines, date, image_data) VALUES (?, ?, ?, ?, ?, ?)").run(sanitizedPatientId, doctor_name, symptoms, JSON.stringify(medicines), date, image_data);
    const newId = result.lastInsertRowid;
    autoSyncPrescription({
      id: newId,
      patient_id: sanitizedPatientId,
      doctor_name,
      symptoms,
      medicines: typeof medicines === 'string' ? medicines : JSON.stringify(medicines),
      date: date || new Date().toISOString().split('T')[0],
      image_data: image_data || null
    });
    res.json({ id: newId });
  });

  app.post("/api/vitals", (req, res) => {
    const { patient_id, bp, weight, symptoms, notes, recorded_by } = req.body;
    const sanitizedPatientId = getValidPatientId(patient_id);
    const result = db.prepare("INSERT INTO vitals (patient_id, bp, weight, symptoms, notes, recorded_by) VALUES (?, ?, ?, ?, ?, ?)").run(sanitizedPatientId, bp, weight, symptoms, notes, recorded_by);
    const newId = result.lastInsertRowid;
    autoSyncVital({
      id: newId,
      patient_id: sanitizedPatientId,
      bp,
      weight,
      symptoms,
      notes,
      recorded_by: recorded_by || 'Staff'
    });
    res.json({ id: newId });
  });

  app.post("/api/alerts", (req, res) => {
    const { patient_id, type, message } = req.body;
    const sanitizedPatientId = getValidPatientId(patient_id);
    const result = db.prepare("INSERT INTO alerts (patient_id, type, message) VALUES (?, ?, ?)").run(sanitizedPatientId, type, message);
    const newId = result.lastInsertRowid;
    autoSyncAlert({
      id: newId,
      patient_id: sanitizedPatientId,
      type,
      message,
      status: 'active'
    });
    res.json({ id: newId });
  });

  // Private Data Endpoints
  app.get("/api/private-data", (req, res) => {
    const data = db.prepare("SELECT * FROM private_data ORDER BY created_at DESC").all();
    res.json(data);
  });

  app.post("/api/private-data", (req, res) => {
    const { staff_id, staff_name, patient_id, content } = req.body;
    const result = db.prepare("INSERT INTO private_data (staff_id, staff_name, patient_id, content) VALUES (?, ?, ?, ?)").run(staff_id, staff_name, patient_id || null, content);
    const newId = result.lastInsertRowid;
    autoSyncPrivateData({
      id: newId,
      staff_id,
      staff_name,
      patient_id: patient_id || null,
      content,
      created_at: new Date().toISOString()
    });
    res.json({ id: newId });
  });

  app.put("/api/private-data/:id", (req, res) => {
    const { content } = req.body;
    db.prepare("UPDATE private_data SET content = ? WHERE id = ?").run(content, req.params.id);
    autoSyncPrivateData({
      id: req.params.id,
      content
    });
    res.json({ success: true });
  });

  app.delete("/api/private-data/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    const result = db.prepare("DELETE FROM private_data WHERE id = ?").run(id);
    autoDeletePrivateData(id);
    res.json({ success: true, changes: result.changes });
  });

  app.post("/api/private-data/sync-all-patients", (req, res) => {
    try {
      const allPatients = db.prepare("SELECT * FROM patients ORDER BY id ASC").all() as any[];
      const checkExisting = db.prepare("SELECT id FROM private_data WHERE patient_id = ?");
      const insertPrivate = db.prepare(
        "INSERT INTO private_data (staff_id, staff_name, patient_id, content, created_at) VALUES (?, ?, ?, ?, ?)"
      );

      let addedCount = 0;
      const insertAllTx = db.transaction((patients: any[]) => {
        for (const p of patients) {
          const exists = checkExisting.get(p.id);
          if (!exists) {
            const content = `SYNCED PATIENT RECORD\n----------------------\nPatient: ${p.name}\nPatient ID: ${p.id}\nAge: ${p.age} • Gender: ${p.gender || 'N/A'}\nWeight: ${p.weight || 'N/A'} kg\nBlood Group: ${p.blood_group || 'O+'}\nDisease/Condition: ${p.chronic_conditions || 'None'}\nAllergies: ${p.allergies || 'None'}\nPast Illness: ${p.past_illness || 'None'}\nStatus: ${p.status || 'Active'}\nSynced on: ${p.created_at || new Date().toISOString()}`;
            insertPrivate.run('DR001', 'Dr. Suresh Sharma', p.id, content, p.created_at || new Date().toISOString());
            addedCount++;
          }
        }
      });

      insertAllTx(allPatients);
      const total = db.prepare("SELECT count(*) as count FROM private_data").get() as { count: number };
      res.json({ success: true, added: addedCount, total: total.count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Pending Lab Results Endpoints
  app.get("/api/pending-lab-results", (req, res) => {
    try {
      const data = db.prepare("SELECT * FROM pending_lab_results ORDER BY created_at DESC").all();
      res.json(data);
    } catch (err: any) {
      console.warn("Could not query pending lab results:", err);
      res.json([]);
    }
  });

  app.post("/api/pending-lab-results", (req, res) => {
    const { patient_id, patient_name, staff_id, staff_name, content, image_data } = req.body;
    const sanitizedPatientId = getValidPatientId(patient_id);
    const result = db.prepare("INSERT INTO pending_lab_results (patient_id, patient_name, staff_id, staff_name, content, image_data) VALUES (?, ?, ?, ?, ?, ?)").run(sanitizedPatientId, patient_name, staff_id, staff_name, content, image_data);
    res.json({ id: result.lastInsertRowid });
  });

  app.delete("/api/pending-lab-results/:id", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    const result = db.prepare("DELETE FROM pending_lab_results WHERE id = ?").run(id);
    res.json({ success: true, changes: result.changes });
  });

  app.post("/api/pending-lab-results/:id/approve", (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const pending = db.prepare("SELECT * FROM pending_lab_results WHERE id = ?").get(id) as any;
    if (!pending) {
      return res.status(404).json({ error: "Pending lab result not found" });
    }

    try {
      const transaction = db.transaction(() => {
        // Insert into private_data
        db.prepare("INSERT INTO private_data (staff_id, staff_name, content) VALUES (?, ?, ?)").run(
          pending.staff_id,
          pending.staff_name,
          pending.content
        );
        // Delete from pending_lab_results
        db.prepare("DELETE FROM pending_lab_results WHERE id = ?").run(id);
      });
      transaction();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // SIH 2026 Submission PDF Download Endpoint
  app.get("/api/download-sih-pdf", (req, res) => {
    const pdfPath = path.resolve("public/CareMatrix_SIH2026_Submission.pdf");
    if (fs.existsSync(pdfPath)) {
      res.setHeader("Content-Disposition", 'attachment; filename="CareMatrix_SIH2026_Submission.pdf"');
      res.setHeader("Content-Type", "application/pdf");
      res.sendFile(pdfPath);
    } else {
      res.status(404).json({ error: "PDF not found" });
    }
  });

  // CareMatrix Firebase Integration Endpoints
  app.get("/api/firebase/config", (req, res) => {
    try {
      const configPath = path.resolve("firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return res.json({ success: true, config: cfg });
      }
      res.json({
        success: true,
        config: {
          projectId: "carematrix-b32f0",
          authDomain: "carematrix-b32f0.firebaseapp.com",
          appId: "1:463309902822:web:9555cc0379937f49ac7c27",
          storageBucket: "carematrix-b32f0.firebasestorage.app",
          messagingSenderId: "463309902822",
          measurementId: "G-TDRDK5WWB3"
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/firebase/export-all-data", (req, res) => {
    try {
      const patients = db.prepare("SELECT * FROM patients ORDER BY id ASC").all();
      const doctors = db.prepare("SELECT * FROM doctors ORDER BY id ASC").all();
      const users = db.prepare("SELECT id, username, name, role, login_count FROM users ORDER BY id ASC").all();
      const appointments = db.prepare("SELECT * FROM appointments ORDER BY id ASC").all();
      const vitals = db.prepare("SELECT * FROM vitals ORDER BY id ASC").all();
      const alerts = db.prepare("SELECT * FROM alerts ORDER BY id ASC").all();
      const private_data = db.prepare("SELECT * FROM private_data ORDER BY id ASC").all();
      const prescriptions = db.prepare("SELECT * FROM prescriptions ORDER BY id ASC").all();
      const pending_lab_results = db.prepare("SELECT * FROM pending_lab_results ORDER BY id ASC").all();

      res.json({
        success: true,
        projectId: "carematrix-b32f0",
        counts: {
          patients: patients.length,
          doctors: doctors.length,
          users: users.length,
          appointments: appointments.length,
          vitals: vitals.length,
          alerts: alerts.length,
          private_data: private_data.length,
          prescriptions: prescriptions.length,
          pending_lab_results: pending_lab_results.length
        },
        patients,
        doctors,
        users,
        appointments,
        vitals,
        alerts,
        private_data,
        prescriptions,
        pending_lab_results
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
