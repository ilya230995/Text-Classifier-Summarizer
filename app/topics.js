/**
 * The predefined topics: the single source of truth used by the prompt, the
 * response schema, output filtering and the offline keyword classifier.
 * To add a topic, add it here (with a description and keywords); nothing else changes.
 */

/** Allowed topics, in the order they are listed to the model. */
export const TOPICS = ['finance', 'technical', 'hr', 'marketing', 'sales', 'support', 'legal', 'other'];

/** One-line meanings shown to the model; short on purpose since they are sent with every request. */
export const TOPIC_DESCRIPTIONS = {
  finance: 'invoices, payments, budgets, expenses, billing, payroll',
  technical: 'engineering, software, infrastructure, deployments, incidents, bugs',
  hr: 'employees, hiring, onboarding, leave, benefits, company events and culture',
  marketing: 'campaigns, brand, social media, newsletters, product launches, PR',
  sales: 'leads, deals, quotes, proposals, pricing, renewals, customer acquisition',
  support: 'customer issues, tickets, troubleshooting, access problems, complaints',
  legal: 'contracts, NDAs, compliance, GDPR, terms, disputes',
  other: 'anything that fits none of the above',
};

/**
 * Keywords for the offline classifier. Matched as whole words, case-insensitive,
 * with an optional plural "s"/"es" (so "invoice" also matches "invoices").
 */
export const TOPIC_KEYWORDS = {
  finance: [
    'invoice', 'payment', 'pay', 'paid', 'overdue', 'budget', 'expense', 'refund', 'billing', 'bill',
    'tax', 'payroll', 'salary', 'salaries', 'reimbursement', 'accounting', 'revenue', 'receipt',
    'bank', 'transfer', 'finance', 'financial', 'cost',
  ],
  technical: [
    'deploy', 'deployment', 'release', 'bug', 'server', 'api', 'database', 'outage', 'incident',
    'engineering', 'code', 'sprint', 'build', 'infrastructure', 'latency', 'security', 'repository',
    'pull request', 'migration', 'downtime', 'backend', 'frontend', 'kubernetes', 'production',
  ],
  hr: [
    'employee', 'staff', 'hiring', 'recruit', 'recruitment', 'interview', 'onboarding', 'vacation',
    'holiday', 'leave', 'payroll', 'benefit', 'retreat', 'team building', 'performance review',
    'training', 'wellbeing', 'candidate', 'hr', 'colleague', 'parental',
  ],
  marketing: [
    'campaign', 'newsletter', 'brand', 'branding', 'social media', 'launch', 'webinar', 'promotion',
    'seo', 'advertising', 'marketing', 'press release', 'audience', 'content', 'social',
  ],
  sales: [
    'deal', 'lead', 'prospect', 'quote', 'proposal', 'demo', 'pricing', 'discount', 'renewal',
    'sales', 'purchase order', 'opportunity', 'trial', 'upsell', 'license',
  ],
  support: [
    'ticket', 'issue', 'help', 'problem', 'password', 'login', 'log in', 'not working', 'complaint',
    'support', 'troubleshoot', 'broken', 'unable', 'cannot', 'error', 'access',
  ],
  legal: [
    'contract', 'nda', 'agreement', 'compliance', 'gdpr', 'terms', 'clause', 'lawyer', 'legal',
    'liability', 'signature', 'privacy', 'dispute', 'counsel',
  ],
};
