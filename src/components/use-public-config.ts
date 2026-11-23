'use client';
import type { PublicConfig } from './api';
import { useResource } from './shared';
import { useParticipationWindow } from './use-participation-window';
import { applyParticipationWindow } from '../domain/participation-config';

export function usePublicConfig(){
 const resource=useResource<PublicConfig>('/api/public/config');
 const schedule=useParticipationWindow();
 return {...resource,data:resource.data?applyParticipationWindow(resource.data,schedule.window,schedule.managed):null,error:resource.error||schedule.error};
}
