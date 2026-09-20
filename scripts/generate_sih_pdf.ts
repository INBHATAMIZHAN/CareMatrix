import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function generateSIHPdf() {
  const doc = await PDFDocument.create();

  // Standard fonts
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  // Widescreen 16:9 dimensions in points: 960 x 540
  const width = 960;
  const height = 540;

  // Theme Colors
  const colors = {
    sihBlue: rgb(0.08, 0.28, 0.62),      // #15479E - Main SIH Navy/Royal Blue
    darkBlue: rgb(0.07, 0.15, 0.35),     // #122659
    accentOrange: rgb(0.93, 0.45, 0.15), // #EC7326 - SIH Orange
    accentGreen: rgb(0.12, 0.62, 0.38),  // #1F9E61 - SIH Green
    lightBg: rgb(0.97, 0.98, 1.0),       // #F8FAFC
    cardBorder: rgb(0.85, 0.89, 0.94),   // #D9E3F0
    cardFill: rgb(0.95, 0.97, 1.0),
    textDark: rgb(0.1, 0.13, 0.18),      // #1A212E
    textMuted: rgb(0.38, 0.44, 0.52),    // #617084
    white: rgb(1, 1, 1),
    lineBlue: rgb(0.82, 0.88, 0.96),
    badgeBg: rgb(0.92, 0.95, 0.99),
  };

  // Helper: Draw Slide Header (for slides 2 to 6)
  function drawSlideHeader(page: PDFPage, title: string) {
    // CareMatrix pill logo (top left)
    const logoX = 45;
    const logoY = height - 42;
    page.drawRectangle({
      x: logoX,
      y: logoY - 14,
      width: 120,
      height: 28,
      borderColor: colors.sihBlue,
      borderWidth: 1.5,
      color: colors.white,
    });
    // CareMatrix text inside pill
    page.drawText('CareMatrix', {
      x: logoX + 16,
      y: logoY - 5,
      size: 14,
      font: fontBold,
      color: colors.sihBlue,
    });
    // Heartbeat dot
    page.drawCircle({
      x: logoX + 102,
      y: logoY,
      size: 3.5,
      color: colors.accentOrange,
    });

    // Center Title
    const titleWidth = fontBold.widthOfTextAtSize(title, 26);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 46,
      size: 26,
      font: fontBold,
      color: colors.textDark,
    });

    // Top Right SIH Emblem & Text
    const sihX = width - 180;
    const sihY = height - 46;
    // Brain-bulb mini icon
    page.drawCircle({ x: sihX - 18, y: sihY + 8, size: 10, color: colors.accentOrange });
    page.drawCircle({ x: sihX - 8, y: sihY + 8, size: 10, color: colors.accentGreen });
    page.drawText('SMART INDIA', {
      x: sihX,
      y: sihY + 11,
      size: 9,
      font: fontBold,
      color: colors.sihBlue,
    });
    page.drawText('HACKATHON 2026', {
      x: sihX,
      y: sihY + 1,
      size: 9,
      font: fontBold,
      color: colors.sihBlue,
    });

    // Header subtle divider line
    page.drawLine({
      start: { x: 45, y: height - 62 },
      end: { x: width - 45, y: height - 62 },
      thickness: 1,
      color: colors.lineBlue,
    });
  }

  // Helper: Draw Slide Footer
  function drawSlideFooter(page: PDFPage, pageNum: number) {
    // Bottom banner bar
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: 32,
      color: colors.sihBlue,
    });
    // Decorative accent stripes
    page.drawRectangle({
      x: 0,
      y: 32,
      width: 160,
      height: 3,
      color: colors.accentOrange,
    });
    page.drawRectangle({
      x: 160,
      y: 32,
      width: 140,
      height: 3,
      color: colors.accentGreen,
    });

    // Footer text
    page.drawText('@SIH Idea submission- Template', {
      x: (width - fontRegular.widthOfTextAtSize('@SIH Idea submission- Template', 11)) / 2,
      y: 11,
      size: 11,
      font: fontRegular,
      color: colors.white,
    });

    // Page number
    page.drawText(`${pageNum}`, {
      x: width - 45,
      y: 11,
      size: 12,
      font: fontBold,
      color: colors.white,
    });
  }

  // ==========================================
  // SLIDE 1: TITLE PAGE
  // ==========================================
  {
    const page = doc.addPage([width, height]);

    // Top Header Banner
    const sihTitle = 'SMART INDIA HACKATHON 2026';
    page.drawText(sihTitle, {
      x: 120,
      y: height - 52,
      size: 28,
      font: fontBold,
      color: colors.sihBlue,
    });

    // SIH Top-Right Logo
    const topX = width - 160;
    const topY = height - 56;
    page.drawCircle({ x: topX - 16, y: topY + 12, size: 12, color: colors.accentOrange });
    page.drawCircle({ x: topX - 4, y: topY + 12, size: 12, color: colors.accentGreen });
    page.drawText('SMART INDIA', { x: topX + 12, y: topY + 16, size: 10, font: fontBold, color: colors.sihBlue });
    page.drawText('HACKATHON 2026', { x: topX + 12, y: topY + 4, size: 10, font: fontBold, color: colors.sihBlue });

    // Center Title "TITLE PAGE"
    const titlePageText = 'TITLE PAGE';
    page.drawText(titlePageText, {
      x: (width - fontBold.widthOfTextAtSize(titlePageText, 32)) / 2,
      y: height - 105,
      size: 32,
      font: fontBold,
      color: colors.textDark,
    });

    // Left Column Info Container
    const leftX = 65;
    let currentY = height - 165;

    const fields = [
      { label: 'Problem Statement ID', value: '67' },
      { 
        label: 'Problem Statement Title', 
        value: 'Accessibility and quality of public healthcare services, particularly in rural and underserved areas.' 
      },
      { label: 'Theme', value: 'MedTech' },
      { label: 'PS Category', value: 'Software / MedTech' },
      { label: 'Team Name', value: 'CareMatrix' },
      { label: 'Team ID', value: 'CareMatrix-67' },
    ];

    for (const field of fields) {
      // Bullet dot
      page.drawCircle({ x: leftX, y: currentY + 4, size: 3.5, color: colors.textDark });
      
      const labelText = `•  ${field.label} – `;
      page.drawText(labelText, {
        x: leftX + 8,
        y: currentY,
        size: 15,
        font: fontBold,
        color: colors.textDark,
      });

      const labelW = fontBold.widthOfTextAtSize(labelText, 15);

      if (field.label === 'Problem Statement Title') {
        // Multi-line wrap
        page.drawText('Accessibility and quality of public healthcare', {
          x: leftX + 8 + labelW,
          y: currentY,
          size: 14,
          font: fontRegular,
          color: colors.textDark,
        });
        currentY -= 22;
        page.drawText('services, particularly in rural and underserved areas.', {
          x: leftX + 26,
          y: currentY,
          size: 14,
          font: fontRegular,
          color: colors.textDark,
        });
        currentY -= 28;
      } else {
        page.drawText(field.value, {
          x: leftX + 8 + labelW,
          y: currentY,
          size: 15,
          font: fontRegular,
          color: colors.textDark,
        });
        currentY -= 32;
      }
    }

    // Right Side: Graphic illustration (Lightbulb / Brain MedTech Innovation)
    const rightCenterX = width - 260;
    const rightCenterY = height / 2 - 20;

    // Glowing circle backplate
    page.drawCircle({
      x: rightCenterX,
      y: rightCenterY,
      size: 95,
      color: rgb(0.96, 0.98, 1.0),
      borderColor: rgb(0.9, 0.93, 0.98),
      borderWidth: 1.5,
    });

    // Left Half Brain (Orange circuits)
    page.drawRectangle({
      x: rightCenterX - 55,
      y: rightCenterY - 45,
      width: 50,
      height: 90,
      color: colors.accentOrange,
    });
    page.drawText('CARE', {
      x: rightCenterX - 45,
      y: rightCenterY + 12,
      size: 11,
      font: fontBold,
      color: colors.white,
    });
    page.drawText('TECH', {
      x: rightCenterX - 45,
      y: rightCenterY - 6,
      size: 11,
      font: fontBold,
      color: colors.white,
    });

    // Right Half Circuit / Binary (Green digital brain)
    page.drawRectangle({
      x: rightCenterX + 5,
      y: rightCenterY - 45,
      width: 50,
      height: 90,
      color: colors.accentGreen,
    });
    page.drawText('1010', {
      x: rightCenterX + 16,
      y: rightCenterY + 22,
      size: 10,
      font: fontBold,
      color: colors.white,
    });
    page.drawText('0101', {
      x: rightCenterX + 16,
      y: rightCenterY + 6,
      size: 10,
      font: fontBold,
      color: colors.white,
    });
    page.drawText('1101', {
      x: rightCenterX + 16,
      y: rightCenterY - 10,
      size: 10,
      font: fontBold,
      color: colors.white,
    });

    // Bulb Base at bottom
    page.drawRectangle({
      x: rightCenterX - 18,
      y: rightCenterY - 65,
      width: 36,
      height: 14,
      color: colors.darkBlue,
    });
    page.drawText('SIH', {
      x: rightCenterX - 11,
      y: rightCenterY - 82,
      size: 12,
      font: fontBold,
      color: colors.darkBlue,
    });

    // Radiating rays
    const rays = [
      { dx: 0, dy: 115 },
      { dx: 80, dy: 80 },
      { dx: 115, dy: 0 },
      { dx: 80, dy: -80 },
      { dx: -80, dy: 80 },
      { dx: -115, dy: 0 },
      { dx: -80, dy: -80 },
    ];
    for (const r of rays) {
      page.drawLine({
        start: { x: rightCenterX + r.dx * 0.75, y: rightCenterY + r.dy * 0.75 },
        end: { x: rightCenterX + r.dx, y: rightCenterY + r.dy },
        thickness: 3.5,
        color: colors.sihBlue,
      });
    }

    drawSlideFooter(page, 1);
  }

  // ==========================================
  // SLIDE 2: IDEA TITLE & PROPOSED SOLUTION
  // ==========================================
  {
    const page = doc.addPage([width, height]);
    drawSlideHeader(page, 'IDEA TITLE');

    // Subheading: Project Banner
    const bannerY = height - 108;
    page.drawRectangle({
      x: 45,
      y: bannerY - 6,
      width: width - 90,
      height: 38,
      color: colors.badgeBg,
      borderColor: colors.cardBorder,
      borderWidth: 1,
    });
    page.drawText('CareMatrix — AI-Powered Offline-First Smart Clinic Platform for Rural Healthcare', {
      x: 60,
      y: bannerY + 6,
      size: 15,
      font: fontBold,
      color: colors.sihBlue,
    });

    // Section Heading
    const secY = height - 142;
    page.drawText('Proposed Solution', {
      x: 48,
      y: secY,
      size: 18,
      font: fontBold,
      color: colors.sihBlue,
    });
    page.drawLine({
      start: { x: 48, y: secY - 4 },
      end: { x: 200, y: secY - 4 },
      thickness: 2,
      color: colors.sihBlue,
    });

    // 5 Solution Points
    const points = [
      {
        title: 'Unified Frontline Healthcare Ecosystem:',
        desc: 'A synchronized digital clinic suite connecting visiting Doctors, Primary Health Centres (PHCs/CHCs), field Nurses/ASHA workers, and rural patients into one single workflow.',
      },
      {
        title: 'Multimodal Intelligent Intake:',
        desc: 'Seamlessly digitizes paper prescriptions, lab reports, manual vitals, and multilingual voice dictations into standardized structured medical records in seconds.',
      },
      {
        title: 'Resilient Offline-First Edge Operation:',
        desc: 'Built with local browser-level OCR and indexed transactional storage, allowing uninterrupted patient consultations and intake even during complete cellular network blackout.',
      },
      {
        title: 'Vernacular & Voice-Enabled Empowerment:',
        desc: 'Overcomes rural literacy barriers through automated audio explanations, local Indian languages translation, and visual dosage schedules for safe medication adherence.',
      },
      {
        title: 'Zero-Infrastructure Portable QR Records:',
        desc: 'Generates dynamic, encrypted QR health cards that store key clinical history directly with the patient, enabling instant emergency access at any referral hospital.',
      },
    ];

    let pY = height - 180;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      // Chevron icon / bullet
      page.drawText('>', {
        x: 48,
        y: pY,
        size: 15,
        font: fontBold,
        color: colors.sihBlue,
      });

      // Point title
      page.drawText(p.title, {
        x: 72,
        y: pY,
        size: 13,
        font: fontBold,
        color: colors.textDark,
      });

      // Description text (wrapped nicely)
      const descY = pY - 18;
      page.drawText(p.desc, {
        x: 72,
        y: descY,
        size: 11.5,
        font: fontRegular,
        color: colors.textMuted,
      });

      pY -= 54;
    }

    drawSlideFooter(page, 2);
  }

  // ==========================================
  // SLIDE 3: TECHNICAL APPROACH WITH FLOW DIAGRAM
  // ==========================================
  {
    const page = doc.addPage([width, height]);
    drawSlideHeader(page, 'TECHNICAL APPROACH');

    // Top Grid: 4 Core Architecture Modules
    const modules = [
      {
        title: 'Frontend & Edge Tier',
        detail: 'React, TypeScript, Vite, Tailwind CSS with responsive progressive web app (PWA) architecture.',
      },
      {
        title: 'Offline Edge OCR',
        detail: 'Client-side Tesseract.js engine with localized transaction queues for zero-internet data capture.',
      },
      {
        title: 'Clinical AI Reasoning',
        detail: 'Multimodal document parsing, Voice Rx structuring, and automated CDSCO/WHO drug safety checks.',
      },
      {
        title: 'Secure Cloud & Vault',
        detail: 'Firebase Firestore with Role-Based Access Control and AES-password-guarded Private Vault.',
      },
    ];

    const boxW = (width - 90 - 36) / 4;
    const boxH = 68;
    const boxY = height - 146;

    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      const mX = 45 + i * (boxW + 12);

      page.drawRectangle({
        x: mX,
        y: boxY,
        width: boxW,
        height: boxH,
        color: colors.cardFill,
        borderColor: colors.cardBorder,
        borderWidth: 1,
      });

      // Module pill / badge
      page.drawText(m.title, {
        x: mX + 10,
        y: boxY + boxH - 18,
        size: 11.5,
        font: fontBold,
        color: colors.sihBlue,
      });

      // Module detail
      const words = m.detail.split(' ');
      const half = Math.ceil(words.length / 2);
      const line1 = words.slice(0, half).join(' ');
      const line2 = words.slice(half).join(' ');

      page.drawText(line1, {
        x: mX + 10,
        y: boxY + boxH - 34,
        size: 9.5,
        font: fontRegular,
        color: colors.textDark,
      });
      page.drawText(line2, {
        x: mX + 10,
        y: boxY + boxH - 47,
        size: 9.5,
        font: fontRegular,
        color: colors.textDark,
      });
    }

    // Middle Section: Flow Diagram Title
    const diagTitleY = height - 176;
    page.drawText('SYSTEM ARCHITECTURE & CLINICAL WORKFLOW FLOW DIAGRAM', {
      x: 48,
      y: diagTitleY,
      size: 13,
      font: fontBold,
      color: colors.sihBlue,
    });

    // Architecture Flow Diagram (5 Stages with Visual Connecting Arrows)
    const stages = [
      {
        num: 'STAGE 1',
        title: 'Frontline Capture',
        sub1: '• Handwritten Rx Scan',
        sub2: '• Voice Rx Dictation',
        sub3: '• Offline QR Scan',
        color: colors.sihBlue,
      },
      {
        num: 'STAGE 2',
        title: 'Edge OCR & Cache',
        sub1: '• Local Tesseract OCR',
        sub2: '• Image Normalization',
        sub3: '• Indexed Offline Queue',
        color: colors.darkBlue,
      },
      {
        num: 'STAGE 3',
        title: 'AI Clinical Reasoner',
        sub1: '• Document Parsing',
        sub2: '• Drug Safety / DDI Check',
        sub3: '• Vernacular Translation',
        color: rgb(0.12, 0.45, 0.7),
      },
      {
        num: 'STAGE 4',
        title: 'Doctor Validation',
        sub1: '• One-Click Verification',
        sub2: '• Dosage / Timing Check',
        sub3: '• Human-in-the-Loop Auth',
        color: colors.accentGreen,
      },
      {
        num: 'STAGE 5',
        title: 'Sync & Portable QR',
        sub1: '• Encrypted Private Vault',
        sub2: '• Dynamic Patient QR Card',
        sub3: '• Cloud Database Sync',
        color: colors.accentOrange,
      },
    ];

    const flowBoxW = 152;
    const flowBoxH = 100;
    const flowBoxY = height - 296;
    const spacing = (width - 90 - (5 * flowBoxW)) / 4; // gap between boxes

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const sX = 45 + i * (flowBoxW + spacing);

      // Card Background
      page.drawRectangle({
        x: sX,
        y: flowBoxY,
        width: flowBoxW,
        height: flowBoxH,
        color: colors.white,
        borderColor: s.color,
        borderWidth: 1.5,
      });

      // Top Tag
      page.drawRectangle({
        x: sX + 8,
        y: flowBoxY + flowBoxH - 18,
        width: 58,
        height: 14,
        color: s.color,
      });
      page.drawText(s.num, {
        x: sX + 13,
        y: flowBoxY + flowBoxH - 14,
        size: 7.5,
        font: fontBold,
        color: colors.white,
      });

      // Title
      page.drawText(s.title, {
        x: sX + 8,
        y: flowBoxY + flowBoxH - 35,
        size: 11,
        font: fontBold,
        color: colors.textDark,
      });

      // Sub-bullets
      page.drawText(s.sub1, {
        x: sX + 8,
        y: flowBoxY + flowBoxH - 52,
        size: 8.5,
        font: fontRegular,
        color: colors.textMuted,
      });
      page.drawText(s.sub2, {
        x: sX + 8,
        y: flowBoxY + flowBoxH - 66,
        size: 8.5,
        font: fontRegular,
        color: colors.textMuted,
      });
      page.drawText(s.sub3, {
        x: sX + 8,
        y: flowBoxY + flowBoxH - 80,
        size: 8.5,
        font: fontRegular,
        color: colors.textMuted,
      });

      // Draw arrow to next stage if not last
      if (i < stages.length - 1) {
        const arrowStartX = sX + flowBoxW + 3;
        const arrowEndX = arrowStartX + spacing - 6;
        const arrowY = flowBoxY + (flowBoxH / 2);

        page.drawLine({
          start: { x: arrowStartX, y: arrowY },
          end: { x: arrowEndX, y: arrowY },
          thickness: 2,
          color: colors.sihBlue,
        });
        // Arrow head
        page.drawLine({
          start: { x: arrowEndX - 5, y: arrowY + 5 },
          end: { x: arrowEndX, y: arrowY },
          thickness: 2,
          color: colors.sihBlue,
        });
        page.drawLine({
          start: { x: arrowEndX - 5, y: arrowY - 5 },
          end: { x: arrowEndX, y: arrowY },
          thickness: 2,
          color: colors.sihBlue,
        });
      }
    }

    // Bottom Summary Banner
    const botY = height - 345;
    page.drawRectangle({
      x: 45,
      y: botY - 32,
      width: width - 90,
      height: 40,
      color: colors.badgeBg,
      borderColor: colors.cardBorder,
      borderWidth: 1,
    });
    page.drawText('Input Modes: Camera scan, image upload, portable QR scan, Voice Rx dictation, manual vitals entry.', {
      x: 60,
      y: botY - 10,
      size: 10.5,
      font: fontBold,
      color: colors.textDark,
    });
    page.drawText('Workflow: Capture -> Extract -> Validate -> AI Drug Safety Check -> Store Locally/Cloud -> Doctor Review.', {
      x: 60,
      y: botY - 24,
      size: 10.5,
      font: fontBold,
      color: colors.sihBlue,
    });

    drawSlideFooter(page, 3);
  }

  // ==========================================
  // SLIDE 4: FEASIBILITY AND VIABILITY
  // ==========================================
  {
    const page = doc.addPage([width, height]);
    drawSlideHeader(page, 'FEASIBILITY AND VIABILITY');

    const items = [
      {
        tag: 'Working Prototype Validated',
        badge: 'READY',
        badgeColor: colors.accentGreen,
        text: 'The working solution already features core operational workflows: digital prescription scanning, voice Rx intake, longitudinal vitals tracking, dynamic QR access, appointment booking, and role-based staff portals.',
      },
      {
        tag: 'Zero Hardware Overhead & Universal Compatibility',
        badge: 'LOW COST',
        badgeColor: colors.sihBlue,
        text: 'Powered entirely by lightweight browser technologies. Runs smoothly on budget Android tablets, standard smartphones, and village clinic laptops without requiring expensive servers or dedicated scanning equipment.',
      },
      {
        tag: 'Engineered for Low & Intermittent Connectivity',
        badge: 'OFFLINE-FIRST',
        badgeColor: colors.accentOrange,
        text: 'Offline-first architecture empowers primary health centres (PHCs), mobile medical vans, and tribal health outposts to record data locally during outages and automatically sync once network is restored.',
      },
      {
        tag: 'Strict Clinician Decision Support & Safety Guardrails',
        badge: 'SAFETY FIRST',
        badgeColor: colors.darkBlue,
        text: 'AI functions exclusively as Clinical Decision Support (CDS) to flag drug-drug interactions and assist transcription. Registered doctors always retain absolute review and sign-off authority.',
      },
      {
        tag: 'Scalable Public Health Rollout & Low TCO',
        badge: 'SCALE',
        badgeColor: colors.accentGreen,
        text: 'Cloud-native database model allows rapid multi-district deployment with minimal operational cost, fitting seamlessly within national digital health mission frameworks.',
      },
    ];

    let curY = height - 130;
    for (const item of items) {
      // Card Container
      page.drawRectangle({
        x: 45,
        y: curY - 36,
        width: width - 90,
        height: 58,
        color: colors.cardFill,
        borderColor: colors.cardBorder,
        borderWidth: 1,
      });

      // Tag pill
      page.drawRectangle({
        x: 60,
        y: curY + 6,
        width: 80,
        height: 16,
        color: item.badgeColor,
      });
      page.drawText(item.badge, {
        x: 66,
        y: curY + 10,
        size: 8,
        font: fontBold,
        color: colors.white,
      });

      // Item Heading
      page.drawText(item.tag, {
        x: 148,
        y: curY + 7,
        size: 13,
        font: fontBold,
        color: colors.textDark,
      });

      // Description
      page.drawText(item.text, {
        x: 60,
        y: curY - 14,
        size: 10.5,
        font: fontRegular,
        color: colors.textMuted,
      });

      curY -= 68;
    }

    drawSlideFooter(page, 4);
  }

  // ==========================================
  // SLIDE 5: IMPACT AND BENEFITS
  // ==========================================
  {
    const page = doc.addPage([width, height]);
    drawSlideHeader(page, 'IMPACT AND BENEFITS');

    const impacts = [
      {
        group: 'Rural Patients & Families:',
        points: 'Eliminates lost paper prescriptions, provides audio-visual dosage instructions in local languages, prevents medication mistakes, and guarantees lifetime portable access to medical history.',
      },
      {
        group: 'Frontline Doctors & Medical Officers:',
        points: 'Reduces manual consultation paperwork by up to 70%, flags potential adverse drug-drug interactions automatically, and provides instant visibility into past vitals and prior lab findings.',
      },
      {
        group: 'Nurses, ASHA Workers & Clinic Staff:',
        points: 'Streamlines health camp vitals intake, lab report scanning, and automated patient follow-ups, reducing administrative stress and speeding up patient queue clearance.',
      },
      {
        group: 'Public Health Administration & Government:',
        points: 'Provides real-time district-level visibility into disease trends, epidemic outbreaks, pharmaceutical stock demands, and clinic visit volumes with zero manual reporting overhead.',
      },
      {
        group: 'Continuity of Care & Referral Integrity:',
        points: 'Dynamic QR health cards ensure seamless, error-free patient handoffs between rural sub-centres (PHCs) and district tertiary hospitals without duplicate record creation.',
      },
    ];

    let impY = height - 130;
    for (const imp of impacts) {
      // Card Container
      page.drawRectangle({
        x: 45,
        y: impY - 36,
        width: width - 90,
        height: 58,
        color: colors.cardFill,
        borderColor: colors.cardBorder,
        borderWidth: 1,
      });

      // Bullet / Chevron
      page.drawText('>', {
        x: 60,
        y: impY + 6,
        size: 14,
        font: fontBold,
        color: colors.sihBlue,
      });

      // Group Heading
      page.drawText(imp.group, {
        x: 82,
        y: impY + 6,
        size: 13,
        font: fontBold,
        color: colors.textDark,
      });

      // Detail
      page.drawText(imp.points, {
        x: 82,
        y: impY - 14,
        size: 10.5,
        font: fontRegular,
        color: colors.textMuted,
      });

      impY -= 68;
    }

    drawSlideFooter(page, 5);
  }

  // ==========================================
  // SLIDE 6: RESEARCH AND REFERENCES (No Gemini AI Studio mentions!)
  // ==========================================
  {
    const page = doc.addPage([width, height]);
    drawSlideHeader(page, 'RESEARCH AND REFERENCES');

    const refs = [
      {
        tag: 'National Health Policy & Interoperability Standards',
        source: 'Ayushman Bharat Digital Mission (ABDM) - National Health Authority (NHA), Govt. of India',
        desc: 'Frameworks and data standards for longitudinal Electronic Health Records (EHR), unified ABHA patient identifiers, and health facility registries across primary and secondary tiers.',
      },
      {
        tag: 'Clinical Decision Support & Prescription Safety Protocols',
        source: 'WHO Model List of Essential Medicines & CDSCO Prescribing Safety Guidelines',
        desc: 'Standardized pharmacology datasets, contraindication taxonomies, and multi-drug interaction screening rules designed to protect patients from polypharmacy risks in primary care.',
      },
      {
        tag: 'Multimodal Vision-Language Models in Clinical Informatics',
        source: 'Peer-Reviewed Clinical Natural Language Processing & Medical Informatics Research',
        desc: 'Grounded in state-of-the-art multimodal vision-language architectures for robust document entity extraction, medical handwriting parsing, and clinical dialogue summarization.',
      },
      {
        tag: 'Offline-First Edge Computing in Rural Health Systems',
        source: 'Tesseract OCR Engine & Progressive Web App (PWA) Offline Synchronization Protocols',
        desc: 'Validated client-side edge computing techniques enabling zero-infrastructure optical character recognition, local indexed data caching, and fault-tolerant cloud synchronisation.',
      },
      {
        tag: 'Portable High-Density Matrix Health Identifiers',
        source: 'ISO/IEC 18004 Standards for High-Capacity 2D QR Matrix Data Interchange',
        desc: 'Design and cryptographic safeguarding of portable two-dimensional matrix cards for offline patient record continuity across remote health clinics and district hospitals.',
      },
    ];

    let refY = height - 130;
    for (const ref of refs) {
      // Card Container
      page.drawRectangle({
        x: 45,
        y: refY - 38,
        width: width - 90,
        height: 60,
        color: colors.cardFill,
        borderColor: colors.cardBorder,
        borderWidth: 1,
      });

      // Chevron
      page.drawText('>', {
        x: 60,
        y: refY + 4,
        size: 13,
        font: fontBold,
        color: colors.sihBlue,
      });

      // Category Tag / Source
      page.drawText(ref.source, {
        x: 82,
        y: refY + 4,
        size: 12.5,
        font: fontBold,
        color: colors.sihBlue,
      });

      // Description / Context
      page.drawText(ref.desc, {
        x: 82,
        y: refY - 16,
        size: 10,
        font: fontRegular,
        color: colors.textMuted,
      });

      refY -= 70;
    }

    drawSlideFooter(page, 6);
  }

  // Save PDF to public folder
  const pdfBytes = await doc.save();
  const outputPath = path.resolve('public/CareMatrix_SIH2026_Submission.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Successfully generated PDF at: ${outputPath} (${pdfBytes.length} bytes)`);
}

generateSIHPdf().catch((err) => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
