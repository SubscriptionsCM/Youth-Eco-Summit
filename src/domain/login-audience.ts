export type LoginAudience = 'student' | 'educator' | 'school' | 'admin';

export const loginAudienceLabels: Record<LoginAudience, string> = {
 student: 'Student', educator: 'Educator', school: 'School', admin: 'Admin or judge',
};
