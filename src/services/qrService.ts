export interface PrescriptionQRPayload {
  type: 'prescription';
  id?: string | number;
  name: string;
  age?: string | number;
  weight?: string | number;
  doctor?: string;
  date: string;
  medicines: string;
  symptoms?: string;
  hash: string;
}

export interface VitalsQRPayload {
  type: 'vitals';
  id?: string | number;
  name: string;
  date: string;
  time: string;
  vitals: {
    bp: string;
    weight?: string | number;
    blood_group?: string;
    pulse?: string;
    sugar?: string;
    temp?: string;
  };
  symptoms?: string;
  notes?: string;
  recorded_by: string;
  triage_level: 'Critical' | 'Moderate' | 'Mild';
  hash: string;
}

export function computeTriageLevel(bp?: string, sugar?: string, symptoms?: string): 'Critical' | 'Moderate' | 'Mild' {
  if (bp) {
    const parts = bp.split('/');
    const systolic = parseInt(parts[0], 10);
    const diastolic = parseInt(parts[1], 10);
    if (!isNaN(systolic) && (systolic >= 180 || systolic < 85)) return 'Critical';
    if (!isNaN(diastolic) && (diastolic >= 110 || diastolic < 55)) return 'Critical';
    if (!isNaN(systolic) && (systolic >= 140 || systolic <= 90)) return 'Moderate';
    if (!isNaN(diastolic) && (diastolic >= 90 || diastolic <= 60)) return 'Moderate';
  }
  if (sugar) {
    const sugarNum = parseInt(sugar, 10);
    if (!isNaN(sugarNum) && (sugarNum > 300 || sugarNum < 60)) return 'Critical';
    if (!isNaN(sugarNum) && (sugarNum > 200 || sugarNum < 70)) return 'Moderate';
  }
  const criticalSymptomsRegex = /(chest pain|breathless|unconscious|severe bleeding|convulsion|stroke|high fever|seizure)/i;
  if (symptoms && criticalSymptomsRegex.test(symptoms)) return 'Critical';

  return 'Mild';
}

function generateVerificationHash(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let hash = 'CQ-';
  for (let i = 0; i < 8; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}

export function buildPrescriptionQRUrl(data: {
  id?: string | number;
  name: string;
  age?: string | number;
  weight?: string | number;
  doctor?: string;
  medicines?: string;
  symptoms?: string;
}): string {
  const payload: PrescriptionQRPayload = {
    type: 'prescription',
    id: data.id,
    name: data.name || 'Unknown Patient',
    age: data.age || 'N/A',
    weight: data.weight || 'N/A',
    doctor: data.doctor || 'Dr. Suresh Sharma',
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    medicines: data.medicines || 'N/A',
    symptoms: data.symptoms,
    hash: generateVerificationHash()
  };

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const origin = window.location.origin;
  return `${origin}/prescription/view?data=${encodeURIComponent(encoded)}`;
}

export function buildVitalsQRUrl(data: {
  id?: string | number;
  name: string;
  bp: string;
  weight?: string | number;
  blood_group?: string;
  pulse?: string;
  sugar?: string;
  temp?: string;
  symptoms?: string;
  notes?: string;
  recorded_by?: string;
}): string {
  const triage = computeTriageLevel(data.bp, data.sugar, data.symptoms);

  const payload: VitalsQRPayload = {
    type: 'vitals',
    id: data.id,
    name: data.name || 'Patient',
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    vitals: {
      bp: data.bp || '120/80',
      weight: data.weight || 'N/A',
      blood_group: data.blood_group || 'N/A',
      pulse: data.pulse || '74 bpm',
      sugar: data.sugar || '98 mg/dL',
      temp: data.temp || '98.6 °F'
    },
    symptoms: data.symptoms || 'None reported',
    notes: data.notes || '',
    recorded_by: data.recorded_by || 'Staff Nurse',
    triage_level: triage,
    hash: generateVerificationHash()
  };

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const origin = window.location.origin;
  return `${origin}/prescription/view?data=${encodeURIComponent(encoded)}`;
}

export function decodeQRRecord(dataParam: string): any {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(dataParam))));
  } catch (err) {
    console.error('Failed to decode QR payload:', err);
    return null;
  }
}
