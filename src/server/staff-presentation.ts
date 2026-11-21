/** Presentation only: authorization always uses the stored role. */
export function staffDisplayRole(user:{role:unknown;staff_username?:unknown}):'Developer'|undefined{
 return user.role==='owner'&&user.staff_username==='rudhraksh'?'Developer':undefined;
}
