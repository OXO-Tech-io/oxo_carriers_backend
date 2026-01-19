// PDF Generator for Salary Slips
// Note: Install pdfkit: npm install pdfkit @types/pdfkit

import PDFDocument from 'pdfkit';
import { MonthlySalary } from '../types';

interface SalarySlipDetailWithName {
  component_id: number;
  amount: number;
  type: 'earning' | 'deduction';
  component_name?: string;
}

// Helper function to format currency with thousand separators
const formatCurrency = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// Helper function to draw a line
const drawLine = (doc: PDFKit.PDFDocument, y: number, width: number = 500) => {
  doc.moveTo(50, y).lineTo(50 + width, y).stroke();
};

export const generateSalarySlipPDF = async (
  salary: MonthlySalary,
  details: SalarySlipDetailWithName[],
  user: any
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4'
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Company Header Section
      doc.fontSize(24).font('Helvetica-Bold').text('OXO INTERNATIONAL', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(18).font('Helvetica-Bold').text('SALARY SLIP', { align: 'center' });
      doc.moveDown(1);
      
      // Draw header line
      drawLine(doc, doc.y);
      doc.moveDown(1);

      // Employee Information Section (Two columns)
      const startY = doc.y;
      const leftColumn = 50;
      const rightColumn = 300;
      
      doc.fontSize(10).font('Helvetica');
      doc.text('Employee Information', { underline: true });
      doc.moveDown(0.5);
      
      doc.fontSize(9);
      doc.text(`Employee ID:`, leftColumn, doc.y, { width: 100, continued: false });
      doc.font('Helvetica-Bold').text(user.employee_id || 'N/A', { continued: false });
      
      doc.moveDown(0.4);
      doc.font('Helvetica');
      doc.text(`Name:`, leftColumn, doc.y, { width: 100, continued: false });
      doc.font('Helvetica-Bold').text(`${user.first_name || ''} ${user.last_name || ''}`, { continued: false });
      
      doc.moveDown(0.4);
      doc.font('Helvetica');
      doc.text(`Department:`, leftColumn, doc.y, { width: 100, continued: false });
      doc.font('Helvetica-Bold').text(user.department || 'N/A', { continued: false });
      
      doc.moveDown(0.4);
      doc.font('Helvetica');
      doc.text(`Position:`, leftColumn, doc.y, { width: 100, continued: false });
      doc.font('Helvetica-Bold').text(user.position || 'N/A', { continued: false });
      
      // Right column - Month and Date
      const monthYear = new Date(salary.month_year);
      doc.font('Helvetica');
      doc.text(`Pay Period:`, rightColumn, startY + 20, { width: 100, continued: false });
      doc.font('Helvetica-Bold').text(monthYear.toLocaleString('default', { month: 'long', year: 'numeric' }), { continued: false });
      
      doc.moveDown(0.4);
      doc.font('Helvetica');
      doc.text(`Payment Date:`, rightColumn, doc.y, { width: 100, continued: false });
      doc.font('Helvetica-Bold').text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), { continued: false });
      
      doc.moveDown(1.5);
      drawLine(doc, doc.y);
      doc.moveDown(1);

      // Extract specific salary components
      const fullSalary = details.find(d => d.component_name === 'Full Salary')?.amount || 0;
      const localSalary = details.find(d => d.component_name === 'Local Salary')?.amount || salary.local_salary || 0;
      const oxoInternationalSalary = details.find(d => d.component_name === 'OXO International Salary')?.amount || salary.oxo_international_salary || 0;
      const epfDeduction = details.find(d => d.component_name === 'Provident Fund' && d.type === 'deduction')?.amount || 0;

      // Earnings Section
      doc.fontSize(12).font('Helvetica-Bold').text('EARNINGS', { underline: true });
      doc.moveDown(0.5);
      
      const earnings = details.filter(d => d.type === 'earning');
      let earningsTotal = 0;
      
      // Table header for earnings
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Description', 60, doc.y, { width: 300 });
      doc.text('Amount (LKR)', 400, doc.y, { width: 100, align: 'right' });
      doc.moveDown(0.3);
      drawLine(doc, doc.y, 450);
      doc.moveDown(0.3);
      
      // Earnings items
      doc.font('Helvetica').fontSize(9);
      earnings.forEach(item => {
        const amount = parseFloat(item.amount.toString());
        earningsTotal += amount;
        doc.text(item.component_name || 'Component', 60, doc.y, { width: 300 });
        doc.text(formatCurrency(amount), 400, doc.y, { width: 100, align: 'right' });
        doc.moveDown(0.4);
      });
      
      // If Local and OXO are not in details, add them explicitly
      if (localSalary > 0 && !earnings.find(e => e.component_name === 'Local Salary')) {
        doc.text('Local Salary', 60, doc.y, { width: 300 });
        doc.text(formatCurrency(localSalary), 400, doc.y, { width: 100, align: 'right' });
        earningsTotal += localSalary;
        doc.moveDown(0.4);
      }
      
      if (oxoInternationalSalary > 0 && !earnings.find(e => e.component_name === 'OXO International Salary')) {
        doc.text('OXO International Salary', 60, doc.y, { width: 300 });
        doc.text(formatCurrency(oxoInternationalSalary), 400, doc.y, { width: 100, align: 'right' });
        earningsTotal += oxoInternationalSalary;
        doc.moveDown(0.4);
      }
      
      // Total Earnings
      doc.moveDown(0.3);
      drawLine(doc, doc.y, 450);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Total Earnings', 60, doc.y, { width: 300 });
      doc.text(formatCurrency(earningsTotal), 400, doc.y, { width: 100, align: 'right' });
      doc.moveDown(1.5);

      // Deductions Section
      doc.fontSize(12).font('Helvetica-Bold').text('DEDUCTIONS', { underline: true });
      doc.moveDown(0.5);
      
      const deductions = details.filter(d => d.type === 'deduction');
      let deductionsTotal = 0;
      
      // Table header for deductions
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Description', 60, doc.y, { width: 300 });
      doc.text('Amount (LKR)', 400, doc.y, { width: 100, align: 'right' });
      doc.moveDown(0.3);
      drawLine(doc, doc.y, 450);
      doc.moveDown(0.3);
      
      // Deductions items
      doc.font('Helvetica').fontSize(9);
      deductions.forEach(item => {
        const amount = parseFloat(item.amount.toString());
        deductionsTotal += amount;
        const description = item.component_name === 'Provident Fund' 
          ? `${item.component_name} (8% of Local Salary)`
          : (item.component_name || 'Component');
        doc.text(description, 60, doc.y, { width: 300 });
        doc.text(formatCurrency(amount), 400, doc.y, { width: 100, align: 'right' });
        doc.moveDown(0.4);
      });
      
      // If EPF is not in details but exists, add it
      if (epfDeduction > 0 && !deductions.find(d => d.component_name === 'Provident Fund')) {
        doc.text('Provident Fund (8% of Local Salary)', 60, doc.y, { width: 300 });
        doc.text(formatCurrency(epfDeduction), 400, doc.y, { width: 100, align: 'right' });
        deductionsTotal += epfDeduction;
        doc.moveDown(0.4);
      }
      
      // Total Deductions
      doc.moveDown(0.3);
      drawLine(doc, doc.y, 450);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Total Deductions', 60, doc.y, { width: 300 });
      doc.text(formatCurrency(deductionsTotal), 400, doc.y, { width: 100, align: 'right' });
      doc.moveDown(2);

      // Net Salary Section (Highlighted)
      const netSalaryY = doc.y;
      doc.rect(50, netSalaryY - 10, 500, 40).fillAndStroke('#f0f0f0', '#000000');
      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('NET SALARY', 60, netSalaryY, { width: 300 });
      doc.text(`LKR ${formatCurrency(salary.net_salary)}`, 400, netSalaryY, { width: 100, align: 'right' });
      doc.moveDown(3);

      // Footer
      drawLine(doc, doc.y);
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica');
      doc.text('This is a system generated document. No signature required.', { align: 'center' });
      doc.text(`Generated on: ${new Date().toLocaleString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}`, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
