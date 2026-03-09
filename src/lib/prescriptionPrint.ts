import type { Prescription } from '../types';

export type PrintLayoutType = 'landscape' | 'portrait1' | 'portrait2';

export function printPrescription(prescription: Prescription, layoutType: PrintLayoutType) {
  const packVol = prescription.pack_volume || 120;
  const waterAmt = prescription.water_amount ||
    Math.round(prescription.final_total_amount * 1.2 + packVol * (prescription.total_packs + 1) + 300);
  const issuedDate = prescription.issued_at
    ? new Date(prescription.issued_at).toLocaleString('ko-KR')
    : '-';

  const patientInfoStr = prescription.patient_name || '-';

  const sortedHerbs = [...prescription.final_herbs].sort((a, b) => {
    const idA = a.herb_id || 99999;
    const idB = b.herb_id || 99999;
    return idA - idB;
  });

  let htmlContent = '';

  if (layoutType === 'landscape') {
    const herbsHtml = sortedHerbs
      .map(h => `<div class="herb-item"><span class="herb-name">${h.name}</span><span class="herb-amount">${Math.round(h.amount)}g</span></div>`)
      .join('');

    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>처방전 - ${prescription.patient_name || '환자'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Malgun Gothic', sans-serif; padding: 10mm; font-size: 11px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 10px; }
          .header h1 { font-size: 24px; letter-spacing: 6px; }
          .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #999; font-size: 13px; }
          .summary-row { display: flex; justify-content: center; gap: 40px; padding: 10px; background: #f0f0f0; margin: 10px 0; font-weight: bold; font-size: 14px; }
          .herbs-container { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0; border: 2px solid #333; }
          .herb-item { display: flex; justify-content: space-between; padding: 5px 8px; background: white; font-size: 11px; border: 1px solid #ccc; }
          .herb-amount { font-weight: bold; min-width: 40px; text-align: right; }
          .total-row { display: flex; justify-content: flex-end; padding: 10px; font-weight: bold; font-size: 14px; background: #f5f5f5; border: 2px solid #333; border-top: none; }
          .water-row { display: flex; justify-content: center; gap: 15px; padding: 12px; margin-top: 10px; background: #e3f2fd; border: 2px solid #1976d2; border-radius: 6px; }
          .water-label { font-size: 16px; font-weight: bold; color: #1565c0; }
          .water-amount { font-size: 20px; font-weight: bold; color: #0d47a1; }
          @media print { body { padding: 8mm; } @page { margin: 0; size: A4 landscape; } }
        </style>
      </head>
      <body>
        <div class="header"><h1>처 방 전</h1></div>
        <div class="info-row">
          <div><strong>환자:</strong> ${patientInfoStr}</div>
          <div><strong>발급일:</strong> ${issuedDate}</div>
        </div>
        <div class="summary-row">
          <span>총 ${prescription.total_packs}팩</span>
          <span>총 ${Math.round(prescription.final_total_amount).toLocaleString()}g</span>
        </div>
        <div class="herbs-container">${herbsHtml}</div>
        <div class="total-row"><span>합계: ${Math.round(prescription.final_total_amount).toLocaleString()}g</span></div>
        <div class="water-row">
          <span class="water-label">탕전 물양:</span>
          <span class="water-amount">${waterAmt.toLocaleString()}ml</span>
        </div>
      </body>
      </html>
    `;
  } else if (layoutType === 'portrait1') {
    const herbsHtml = sortedHerbs
      .map(h => `<div class="herb-item"><span class="herb-name">${h.name}</span><span class="herb-amount">${Math.round(h.amount)}g</span></div>`)
      .join('');

    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>처방전 - ${prescription.patient_name || '환자'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Malgun Gothic', sans-serif; padding: 15mm; font-size: 12px; width: 210mm; min-height: 297mm; }
          .header { text-align: center; border-bottom: 3px solid #333; padding-bottom: 12px; margin-bottom: 15px; }
          .header h1 { font-size: 28px; font-weight: bold; letter-spacing: 8px; margin-bottom: 6px; }
          .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #999; font-size: 14px; }
          .summary-row { display: flex; justify-content: center; gap: 50px; padding: 12px; background: #f0f0f0; margin: 12px 0; font-weight: bold; font-size: 16px; border: 1px solid #ccc; }
          .herbs-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 2px solid #333; margin-top: 10px; }
          .herb-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: white; font-size: 13px; border: 1px solid #ccc; }
          .herb-name { font-weight: 500; }
          .herb-amount { font-weight: bold; color: #333; min-width: 50px; text-align: right; }
          .total-row { display: flex; justify-content: flex-end; padding: 12px 15px; font-weight: bold; font-size: 16px; background: #f5f5f5; border: 2px solid #333; border-top: none; }
          .water-row { display: flex; justify-content: center; align-items: center; gap: 15px; padding: 15px; margin-top: 15px; background: #e3f2fd; border: 3px solid #1976d2; border-radius: 8px; }
          .water-label { font-size: 18px; font-weight: bold; color: #1565c0; }
          .water-amount { font-size: 24px; font-weight: bold; color: #0d47a1; }
          @media print { body { padding: 10mm; } @page { margin: 0; size: A4 portrait; } }
        </style>
      </head>
      <body>
        <div class="header"><h1>처 방 전</h1></div>
        <div class="info-row">
          <div><strong>환자:</strong> ${patientInfoStr}</div>
          <div><strong>발급일:</strong> ${issuedDate}</div>
        </div>
        <div class="summary-row">
          <span>총 ${prescription.total_packs}팩</span>
          <span>총 ${Math.round(prescription.final_total_amount).toLocaleString()}g</span>
        </div>
        <div class="herbs-container">${herbsHtml}</div>
        <div class="total-row"><span>합계: ${Math.round(prescription.final_total_amount).toLocaleString()}g</span></div>
        <div class="water-row">
          <span class="water-label">탕전 물양:</span>
          <span class="water-amount">${waterAmt.toLocaleString()}ml</span>
        </div>
      </body>
      </html>
    `;
  } else {
    const MAX_HERBS_LEFT = 30;
    const needsTwoColumns = sortedHerbs.length > MAX_HERBS_LEFT;

    const leftHerbs = needsTwoColumns ? sortedHerbs.slice(0, MAX_HERBS_LEFT) : sortedHerbs;
    const rightHerbs = needsTwoColumns ? sortedHerbs.slice(MAX_HERBS_LEFT) : [];

    const leftHerbsHtml = leftHerbs
      .map(h => `<tr><td class="row">${h.name}</td><td class="row">${Math.round(h.amount)}g</td></tr>`)
      .join('');

    const rightHerbsHtml = rightHerbs
      .map(h => `<tr><td class="row">${h.name}</td><td class="row">${Math.round(h.amount)}g</td></tr>`)
      .join('');

    const summaryHtml = `
      <tr>
        <td class="row summary-row">총 ${sortedHerbs.length}개</td>
        <td class="row summary-row" style="text-align:right">총 ${Math.round(prescription.final_total_amount).toLocaleString()}g</td>
      </tr>
      <tr>
        <td class="row">${packVol}ml</td>
        <td class="row" style="text-align:right">${prescription.total_packs}팩</td>
      </tr>
      <tr>
        <td class="row water-row">${waterAmt.toLocaleString()}ml</td>
        <td class="row"><button class="print-btn" onclick="window.print()">인쇄하기</button></td>
      </tr>
    `;

    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title></title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Malgun Gothic', sans-serif; padding: 5mm 15mm 15mm 15mm; }
          .container { display: flex; gap: 20px; align-items: flex-start; }
          table { border-collapse: collapse; width: 200px; }
          .row { border: 1px solid #999; padding: 5px 10px; height: 28px; font-size: 14px; }
          .header-row { font-weight: bold; font-size: 16px; background: #f5f5f5; }
          .summary-row { font-weight: bold; background: #e8e8e8; }
          .water-row { font-weight: bold; background: #e3f2fd; color: #1565c0; }
          .print-btn { padding: 8px 16px; font-size: 14px; cursor: pointer; background: #1976d2; color: white; border: none; border-radius: 4px; }
          .print-btn:hover { background: #1565c0; }
          @media print { .print-btn { display: none; } @page { margin: 10mm; size: A4 portrait; } }
        </style>
      </head>
      <body>
        <div class="container">
          <table>
            <tr><td class="row header-row" colspan="2">${patientInfoStr}</td></tr>
            <tr><td class="row" colspan="2">${issuedDate}</td></tr>
            ${leftHerbsHtml}
            ${!needsTwoColumns ? summaryHtml : ''}
          </table>
          ${needsTwoColumns ? `
          <table>
            ${rightHerbsHtml}
            ${summaryHtml}
          </table>
          ` : ''}
        </div>
      </body>
      </html>
    `;
  }

  // iframe 방식으로 인쇄 (팝업 차단 우회)
  let printFrame = document.getElementById('print-frame') as HTMLIFrameElement | null;
  if (!printFrame) {
    printFrame = document.createElement('iframe');
    printFrame.id = 'print-frame';
    printFrame.style.position = 'fixed';
    printFrame.style.left = '-9999px';
    printFrame.style.top = '-9999px';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    document.body.appendChild(printFrame);
  }

  const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
  if (!frameDoc) {
    alert('인쇄 기능을 사용할 수 없습니다.');
    return;
  }

  frameDoc.open();
  frameDoc.write(htmlContent);
  frameDoc.close();

  // iframe 로드 후 인쇄
  printFrame.onload = () => {
    printFrame!.contentWindow?.print();
  };
}
