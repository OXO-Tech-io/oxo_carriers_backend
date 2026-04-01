// pdfGenerator.ts
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface SalaryData {
  salary: {
    id: number;
    user_id: number;
    month_year: string | Date;
    basic_salary: number;
    local_salary?: number;
    oxo_international_salary?: number;
    total_earnings: number;
    total_deductions: number;
    net_salary: number;
    status: string;
    created_at: string | Date;
  };
  details: Array<{
    id: number;
    component_id: number;
    amount: number;
    type: 'earning' | 'deduction';
    component_name?: string;
    component_type?: string;
  }>;
  user: {
    employee_id?: string;
    first_name: string;
    last_name: string;
    position?: string;
  };
}

// Helper function to format currency with thousand separators
const formatCurrency = (value: number | string | undefined): string => {
  let numValue: number;
  if (typeof value === 'string') {
    numValue = parseFloat(value);
  } else {
    numValue = value || 0;
  }
  
  if (isNaN(numValue)) {
    numValue = 0;
  }
  
  return numValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// Helper to get month name from date string or Date object
const getMonthYear = (dateValue: string | Date): string => {
  try {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return 'Invalid Date';
  }
};

// Convert points to PDF units (72 points per inch)
const ptToPDF = (pt: number): number => pt * 0.75;

// Helper function to draw table cell with border
const drawTableCell = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  options: {
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    fontSize?: number;
  } = {}
) => {
  const { align = 'left', bold = false, fontSize = 11 } = options;
  
  // Draw border
  doc.rect(x, y, width, height).stroke();
  
  // Calculate text position
  const padding = ptToPDF(5.4);
  let textX = x + padding;
  
  if (align === 'center') {
    textX = x + width / 2;
  } else if (align === 'right') {
    textX = x + width - padding;
  }
  
  // Set font (PDFKit built-in fonts: Times-Roman, Times-Bold, Helvetica, Courier)
  const fontFamily = 'Times-Roman';
  const fontName = bold ? 'Times-Bold' : 'Times-Roman';
  
  // Add text
  doc.font(fontName).fontSize(fontSize);
  
  if (align === 'center') {
    doc.text(text || '', x + padding, y + ptToPDF(4), {
      width: width - (padding * 2),
      align: 'center'
    });
  } else if (align === 'right') {
    doc.text(text || '', x + padding, y + ptToPDF(4), {
      width: width - (padding * 2),
      align: 'right'
    });
  } else {
    doc.text(text || '', x + padding, y + ptToPDF(4), {
      width: width - (padding * 2),
      align: 'left'
    });
  }
};

export const generateSalarySlipPDF = async (data: SalaryData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 36, // 0.5 inch margins
        size: 'A4',
        layout: 'portrait'
      });
      
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          console.log(`[PDFGenerator] ✅ PDF generated successfully (${pdfBuffer.length} bytes)`);
          resolve(pdfBuffer);
        } catch (error: any) {
          console.error(`[PDFGenerator] ❌ Error creating buffer:`, error);
          reject(error);
        }
      });
      doc.on('error', (error) => {
        console.error(`[PDFGenerator] ❌ PDF document error:`, error);
        reject(error);
      });

      // Extract salary components
      if (!data || !data.salary || !data.user) {
        throw new Error('Invalid data provided to PDF generator');
      }
      
      const details = data.details || [];
      const salary = data.salary;
      const user = data.user;
      
      // Calculate values with fallbacks
      const localSalary = Number(details.find(d => d.component_name === 'Local Salary')?.amount || salary.local_salary || 0);
      const oxoInternationalSalary = Number(details.find(d => d.component_name === 'OXO International Salary')?.amount || salary.oxo_international_salary || 0);
      const epfDeduction = Number(details.find(d => d.component_name === 'Provident Fund' && d.type === 'deduction')?.amount || 0);
      const allowances = Number(details.find(d => d.component_name === 'Allowances' && d.type === 'earning')?.amount || 0);
      const salaryAdvanceDeductions = Number(details.find(d => d.component_name === 'Salary Advance/Deductions' && d.type === 'deduction')?.amount || 0);
      
      // Calculate derived values (ensure all are valid numbers)
      const localEarnings = (isNaN(localSalary) ? 0 : localSalary) + (isNaN(allowances) ? 0 : allowances);
      const totalDeductions = isNaN(Number(salary?.total_deductions)) 
        ? ((isNaN(epfDeduction) ? 0 : epfDeduction) + (isNaN(salaryAdvanceDeductions) ? 0 : salaryAdvanceDeductions))
        : Number(salary.total_deductions);
      const netLocalPay = localEarnings - totalDeductions;
      const netForeignPay = isNaN(oxoInternationalSalary) ? 0 : oxoInternationalSalary;
      const monthlyTotalNetPay = netLocalPay + netForeignPay;
      
      console.log(`[PDFGenerator] Calculated values:`, {
        localSalary,
        allowances,
        localEarnings,
        epfDeduction,
        salaryAdvanceDeductions,
        totalDeductions,
        netLocalPay,
        oxoInternationalSalary,
        netForeignPay,
        monthlyTotalNetPay
      });

      // Set up constants for layout
      const pageWidth = doc.page.width;
      const marginLeft = 36;
      const marginRight = 36;
      const contentWidth = pageWidth - marginLeft - marginRight;
      let yPos = 36; // Start position

      // Register fonts (Garamond may not be available, use Times-Roman as fallback)
      // PDFKit built-in fonts: Helvetica, Times-Roman, Courier
      const fontFamily = 'Times-Roman';
      
      // 1. Logo section (right aligned)
      const logoWidth = ptToPDF(106); // Convert from points
      const logoHeight = ptToPDF(59.14);
      
      // Try to load logo if exists
      const possibleLogoPaths = [
        path.join(process.cwd(), 'public', 'logo.png'),
        path.join(process.cwd(), '..', 'public', 'logo.png'),
        path.join(__dirname, '..', 'public', 'logo.png'),
      ];
      
      let logoLoaded = false;
      for (const logoPath of possibleLogoPaths) {
        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, pageWidth - marginRight - logoWidth, yPos, {
              width: logoWidth,
              height: logoHeight
            });
            logoLoaded = true;
            break;
          } catch (error) {
            console.log('Could not load logo from:', logoPath);
          }
        }
      }
      
      if (!logoLoaded) {
        // Draw placeholder for logo
        doc.rect(pageWidth - marginRight - logoWidth, yPos, logoWidth, logoHeight)
           .stroke();
        doc.fontSize(8)
           .text('LOGO', pageWidth - marginRight - logoWidth, yPos + logoHeight/2 - 4, {
             width: logoWidth,
             align: 'center'
           });
      }
      
      yPos += logoHeight + ptToPDF(8);

      // 2. Company Header (centered)
      doc.font('Times-Bold')
         .fontSize(11)
         .text('OXO International FZE', marginLeft, yPos, {
           width: contentWidth,
           align: 'center'
         });
      
      yPos += 15;
      
      doc.font('Times-Roman')
         .fontSize(11)
         .text('Business Centre, Sharjah Publishing City Free Zone, Sharjah,UAE.,', marginLeft, yPos, {
           width: contentWidth,
           align: 'center'
         });
      
      yPos += 12;
      
      doc.text('E-mail: mahen@oxoholdings.biz Web: www.oxointernational.com', marginLeft, yPos, {
        width: contentWidth,
        align: 'center'
      });
      
      yPos += 20;

      // 3. Pay slip month
      doc.font('Times-Bold')
         .fontSize(12)
         .text(`Pay slip for the month of ${getMonthYear(salary.month_year)}`, marginLeft, yPos, {
           width: contentWidth,
           align: 'center'
         });
      
      yPos += 20;

      // 4. Employee Information Table
      const empTableWidth = contentWidth;
      const empTableCol1Width = empTableWidth * 0.49;
      const empTableCol2Width = empTableWidth * 0.51;
      const empRowHeight = 45;

      // Draw table borders
      doc.rect(marginLeft, yPos, empTableWidth, empRowHeight).stroke();
      doc.moveTo(marginLeft + empTableCol1Width, yPos)
         .lineTo(marginLeft + empTableCol1Width, yPos + empRowHeight)
         .stroke();

      // Left column content
      doc.font('Times-Bold')
         .fontSize(11)
         .text(`Employee ID : ${user.employee_id || 'N/A'}`, 
               marginLeft + ptToPDF(5.4), yPos + ptToPDF(4));
      doc.text(`Employee Name : ${user.first_name} ${user.last_name}`, 
               marginLeft + ptToPDF(5.4), yPos + ptToPDF(17));
      doc.text(`Designation : ${user.position || 'N/A'}`, 
               marginLeft + ptToPDF(5.4), yPos + ptToPDF(30));

      // Right column content
      doc.text('Bank :', 
               marginLeft + empTableCol1Width + ptToPDF(5.4), yPos + ptToPDF(4));
      doc.text('Branch :', 
               marginLeft + empTableCol1Width + ptToPDF(5.4), yPos + ptToPDF(17));
      doc.text('Account No :', 
               marginLeft + empTableCol1Width + ptToPDF(5.4), yPos + ptToPDF(30));

      yPos += empRowHeight + ptToPDF(8);

      // 5. Local Remittance Section
      const tableCol1Width = empTableWidth * 0.236; // 108.1pt / 458.8pt
      const tableCol2Width = empTableWidth * 0.255; // 116.8pt / 458.8pt
      const tableCol3Width = empTableWidth * 0.255; // 116.9pt / 458.8pt
      const tableCol4Width = empTableWidth * 0.254; // 116.9pt / 458.8pt
      const tableRowHeight = ptToPDF(22);

      // Local Remittance Header
      drawTableCell(doc, marginLeft, yPos, empTableWidth, tableRowHeight, 
                    'Local Remittance', { bold: true, align: 'left' });
      yPos += tableRowHeight;

      // Earnings | Deductions headers
      drawTableCell(doc, marginLeft, yPos, tableCol1Width + tableCol2Width, tableRowHeight, 
                    'Earnings', { bold: true, align: 'center' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, 
                    tableCol3Width + tableCol4Width, tableRowHeight, 
                    'Deductions', { bold: true, align: 'center' });
      yPos += tableRowHeight;

      // Row 1: Basic Salary | Loans/Advances
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Basic Salary', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    `LKR ${formatCurrency(localSalary)}`, { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    'Loans/Advances', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    salaryAdvanceDeductions > 0 ? `LKR ${formatCurrency(salaryAdvanceDeductions)}` : 'N/A', 
                    { align: 'right' });
      yPos += tableRowHeight;

      // Row 2: Allowances | EPF 8%
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Allowances', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    allowances > 0 ? `LKR ${formatCurrency(allowances)}` : 'N/A', 
                    { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    'EPF 8%', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    `LKR ${formatCurrency(epfDeduction)}`, 
                    { align: 'right' });
      yPos += tableRowHeight;

      // Row 3: Arrears | Other Deductions
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Arrears', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    'Other Deductions', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    salaryAdvanceDeductions > 0 ? `LKR ${formatCurrency(salaryAdvanceDeductions)}` : 'N/A', 
                    { align: 'right' });
      yPos += tableRowHeight;

      // Row 4: Gross Salary | Total Deductions
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Gross Salary', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    `LKR ${formatCurrency(localEarnings)}`, { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    'Total Deductions', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    `LKR ${formatCurrency(totalDeductions)}`, 
                    { align: 'right' });
      yPos += tableRowHeight;

      // Row 5: Net Local Pay (spans 3 columns)
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Net Local Pay', { bold: true });
      doc.rect(marginLeft + tableCol1Width, yPos, 
               tableCol2Width + tableCol3Width + tableCol4Width, tableRowHeight).stroke();
      doc.font('Times-Roman')
         .fontSize(11)
         .text(`LKR ${formatCurrency(netLocalPay)}`, 
               marginLeft + tableCol1Width, yPos + ptToPDF(4), {
                 width: tableCol2Width + tableCol3Width + tableCol4Width - ptToPDF(10.8),
                 align: 'right'
               });
      yPos += tableRowHeight + ptToPDF(8);

      // 6. Foreign Remittance Section
      // Foreign Remittance Header
      drawTableCell(doc, marginLeft, yPos, empTableWidth, tableRowHeight, 
                    'Foreign Remittance', { bold: true, align: 'left' });
      yPos += tableRowHeight;

      // Earnings | Deductions headers
      drawTableCell(doc, marginLeft, yPos, tableCol1Width + tableCol2Width, tableRowHeight, 
                    'Earnings', { bold: true, align: 'center' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, 
                    tableCol3Width + tableCol4Width, tableRowHeight, 
                    'Deductions', { bold: true, align: 'center' });
      yPos += tableRowHeight;

      // Row 1: Basic Salary | Loans/Advances
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Basic Salary', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    `LKR ${formatCurrency(oxoInternationalSalary)}`, { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    'Loans/Advances', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      yPos += tableRowHeight;

      // Row 2: Allowances (Fixed) | Other Deductions
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Allowances (Fixed)', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    'Other Deductions', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      yPos += tableRowHeight;

      // Row 3: Allowances (Variable) | empty
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Allowances (Variable)', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    '', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      yPos += tableRowHeight;

      // Row 4: Arrears | empty
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Arrears', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    '', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    'N/A', { align: 'right' });
      yPos += tableRowHeight;

      // Row 5: OXO International Salary | Total Deductions
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'OXO International Salary', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width, yPos, tableCol2Width, tableRowHeight, 
                    `LKR ${formatCurrency(oxoInternationalSalary)}`, { align: 'right' });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width, yPos, tableCol3Width, tableRowHeight, 
                    'Total Deductions', { bold: true });
      drawTableCell(doc, marginLeft + tableCol1Width + tableCol2Width + tableCol3Width, yPos, 
                    tableCol4Width, tableRowHeight, 
                    'LKR 0.00', { align: 'right' });
      yPos += tableRowHeight;

      // Row 6: Net Foreign Pay (spans 3 columns)
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Net Foreign Pay', { bold: true });
      doc.rect(marginLeft + tableCol1Width, yPos, 
               tableCol2Width + tableCol3Width + tableCol4Width, tableRowHeight).stroke();
      doc.font('Times-Roman')
         .fontSize(11)
         .text(`LKR ${formatCurrency(netForeignPay)}`, 
               marginLeft + tableCol1Width, yPos + ptToPDF(4), {
                 width: tableCol2Width + tableCol3Width + tableCol4Width - ptToPDF(10.8),
                 align: 'right'
               });
      yPos += tableRowHeight;

      // Row 7: Monthly Total Net Pay (spans 3 columns)
      drawTableCell(doc, marginLeft, yPos, tableCol1Width, tableRowHeight, 
                    'Monthly Total Net Pay', { bold: true });
      doc.rect(marginLeft + tableCol1Width, yPos, 
               tableCol2Width + tableCol3Width + tableCol4Width, tableRowHeight).stroke();
      doc.font('Times-Bold')
         .fontSize(11)
         .text(`LKR ${formatCurrency(monthlyTotalNetPay)}`, 
               marginLeft + tableCol1Width, yPos + ptToPDF(4), {
                 width: tableCol2Width + tableCol3Width + tableCol4Width - ptToPDF(10.8),
                 align: 'right'
               });
      yPos += tableRowHeight + ptToPDF(16);

      // 7. Seal/Signature (right aligned)
      const sealSize = ptToPDF(208);
      
      // Try to load seal if exists
      const possibleSealPaths = [
        path.join(process.cwd(), 'public', 'seal.png'),
        path.join(process.cwd(), '..', 'public', 'seal.png'),
        path.join(__dirname, '..', 'public', 'seal.png'),
      ];
      
      let sealLoaded = false;
      for (const sealPath of possibleSealPaths) {
        if (fs.existsSync(sealPath)) {
          try {
            doc.image(sealPath, pageWidth - marginRight - sealSize, yPos, {
              width: sealSize,
              height: sealSize
            });
            sealLoaded = true;
            break;
          } catch (error) {
            console.log('Could not load seal from:', sealPath);
          }
        }
      }
      
      if (!sealLoaded) {
        // Draw placeholder for seal
        doc.circle(pageWidth - marginRight - sealSize/2, yPos + sealSize/2, sealSize/2)
           .stroke();
        doc.fontSize(8)
           .text('SEAL', pageWidth - marginRight - sealSize, yPos + sealSize/2 - 4, {
             width: sealSize,
             align: 'center'
           });
      }
      
      yPos += sealSize + ptToPDF(10);

      // 8. Footer line and text
      doc.moveTo(marginLeft, yPos)
         .lineTo(pageWidth - marginRight, yPos)
         .lineWidth(0.5)
         .stroke();
      
      yPos += ptToPDF(4);
      
      doc.font('Helvetica')
         .fontSize(12)
         .text('OXO International FZE', marginLeft, yPos);

      doc.end();
    } catch (error: any) {
      console.error(`[PDFGenerator] ❌ Error in PDF generation:`, error);
      console.error(`[PDFGenerator] Error stack:`, error?.stack);
      reject(error);
    }
  });
};