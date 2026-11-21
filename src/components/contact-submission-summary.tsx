import type {ContactSubmissionSummary} from '../domain/contact-submission';

export function ContactSubmissionDetails({contact}:{contact:ContactSubmissionSummary}){
 return <dl className="inbox-contact-details"><div><dt>Name</dt><dd>{contact.name||'Not recorded'}</dd></div><div><dt>Email</dt><dd>{contact.email||'Not recorded'}</dd></div><div><dt>Phone</dt><dd>{contact.phone||'Not recorded'}</dd></div><div className="inbox-contact-message"><dt>Message preview</dt><dd>{contact.messagePreview||'Not recorded'}</dd></div></dl>;
}
