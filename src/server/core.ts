import { randomUUID } from 'node:crypto';
import type { Db } from './db';
import type {ParticipantKind} from '../domain/participant-access';
import type {LoginAudience} from '../domain/login-audience';
export type Actor = { id: string; role: 'owner' | 'admin' | 'judge' | 'participant'; contact?: string; participantKind?:ParticipantKind };
export class AppError extends Error {
 constructor(public status: number, message: string, public details?: {code:'LOGIN_AUDIENCE_MISMATCH';loginAudience:LoginAudience}) { super(message); }
}
export function requireAdmin(actor: Actor) { if (!['owner', 'admin'].includes(actor.role)) throw new AppError(403, 'Administrator access required.'); }
export const id = () => randomUUID();
export async function audit(db: Db, actor: Actor, action: string, entityType: string, entityId: string, detail: unknown = {}) {
  await db.query('INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)', [id(),actor.id,action,entityType,entityId,JSON.stringify(detail)]);
}
export function ok(data: unknown, status = 200) { return Response.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } }); }
