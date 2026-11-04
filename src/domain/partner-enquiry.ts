import { z } from 'zod';
export { partnerConsent } from '../data/partner-enquiry';
export const partnerEnquirySchema = z.object({
  submissionId: z.uuid(),
  organization: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(150),
  email: z.email().trim().toLowerCase().max(254),
  phone: z.string().trim().max(30).refine(value => !value || /^\+?[0-9 ()-]{7,30}$/.test(value), 'Enter a valid phone number.').default(''),
  interest: z.enum(['programme', 'resources', 'outreach', 'other']),
  message: z.string().trim().min(20).max(3000),
  consent: z.literal(true),
  website: z.string().max(200).default(''),
});
