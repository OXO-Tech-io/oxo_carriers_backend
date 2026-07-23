import { renderMasterLayout, renderDetailsTable, DetailsRow } from './masterLayout';

export interface FormResponseNotificationParams {
  ownerName: string;
  formTitle: string;
  respondentName: string;
  submittedDate: string;
  ctaUrl?: string;
}

export interface FormSubmissionConfirmationParams {
  respondentName: string;
  formTitle: string;
  submittedDate: string;
  ctaUrl?: string;
}

export interface FormDistributionParams {
  respondentName: string;
  formTitle: string;
  ctaUrl?: string;
}

/**
 * 1. Sent to the form owner when `form_settings.notify_owner_on_response` is enabled and an
 *    employee submits a (first) response.
 */
export const getFormResponseNotificationHtml = (params: FormResponseNotificationParams): string => {
  const details: DetailsRow[] = [
    { label: 'Form', value: params.formTitle },
    { label: 'Submitted By', value: params.respondentName },
    { label: 'Submitted At', value: params.submittedDate },
  ];

  return renderMasterLayout({
    subject: `New response - ${params.formTitle}`,
    preheader: `${params.respondentName} just submitted a response to "${params.formTitle}".`,
    heroIcon: 'info',
    statusBadgeText: 'NEW RESPONSE',
    statusBadgeType: 'success',
    title: 'New Form Response',
    messageHtml: `<p style="margin:0;">Hello ${params.ownerName},</p><p style="margin:12px 0 0 0;">A new response has been submitted for your form. You can review all responses and analytics in the HR Portal.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View Responses',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/admin/forms',
  });
};

/**
 * 2. Sent to each resolved recipient (individual or group member) when HR distributes a form,
 *    linking straight to the portal's fill-out view for that form.
 */
export const getFormDistributionHtml = (params: FormDistributionParams): string => {
  const details: DetailsRow[] = [{ label: 'Form', value: params.formTitle }];

  return renderMasterLayout({
    subject: `New form to fill out - ${params.formTitle}`,
    preheader: `HR has assigned you a form: "${params.formTitle}".`,
    heroIcon: 'info',
    statusBadgeText: 'NEW FORM',
    statusBadgeType: 'neutral',
    title: 'New Form Assigned',
    messageHtml: `<p style="margin:0;">Hello ${params.respondentName},</p><p style="margin:12px 0 0 0;">HR has assigned you a form to fill out. Click below to open it in the portal.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'Fill Out Form',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/my-forms',
  });
};

/**
 * 3. Sent to the respondent when `form_settings.notify_respondent` is enabled, confirming their
 *    submission was received.
 */
export const getFormSubmissionConfirmationHtml = (params: FormSubmissionConfirmationParams): string => {
  const details: DetailsRow[] = [
    { label: 'Form', value: params.formTitle },
    { label: 'Submitted At', value: params.submittedDate },
  ];

  return renderMasterLayout({
    subject: `Response Received - ${params.formTitle}`,
    preheader: `Your response to "${params.formTitle}" has been received.`,
    heroIcon: 'success',
    statusBadgeText: 'SUBMITTED',
    statusBadgeType: 'success',
    title: 'Response Submitted',
    messageHtml: `<p style="margin:0;">Hello ${params.respondentName},</p><p style="margin:12px 0 0 0;">Thank you - your response has been recorded successfully.</p>`,
    detailsTableHtml: renderDetailsTable(details),
    ctaText: 'View My Forms',
    ctaLink: params.ctaUrl || 'https://oxo-carriers-frontend-297614602590.us-central1.run.app/my-forms',
  });
};
