import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface CommunicationEmailParams {
  employeeName: string;
  title: string;
  bodyHtml: string;
  sentDate?: string;
  ctaUrl?: string;
}

export const getCommunicationEmailHtml = (params: CommunicationEmailParams): string => {
  const details: DetailsRow[] = [
    { label: 'Subject', value: params.title },
    { label: 'Sent Date', value: params.sentDate || new Date().toLocaleDateString() },
  ];

  return renderMasterLayout({
    subject: params.title,
    preheader: `New communication from HR: ${params.title}`,
    heroIcon: 'info',
    statusBadgeText: 'NEW COMMUNICATION',
    statusBadgeType: 'neutral',
    title: params.title,
    messageHtml: `<p style="margin:0;">Hello ${params.employeeName},</p><p style="margin:12px 0 0 0;">${params.bodyHtml}</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View & Respond',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/my-communications',
  });
};
