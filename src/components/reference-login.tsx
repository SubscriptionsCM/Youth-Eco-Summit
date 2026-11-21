'use client';
import { EmailAccount } from './email-account';
import { LoginPage } from './auth-pages';
import { PageTitle } from './shared';
import { afterLoginPath } from './auth-navigation';
import {api,type Row} from './api';
export function ReferenceLogin(){return <><PageTitle title="Sign in">Return to your saved registrations, entries and receipts.</PageTitle><EmailAccount onSignedIn={async()=>{const session=await api<Row>('/api/auth/session');if(!session.actor)throw new Error('Sign in could not be confirmed.');window.location.assign(afterLoginPath(session.actor.role,new URLSearchParams(window.location.search).get('next'),session.actor.participantKind));}}/><details><summary>Administrator or judge sign-in</summary><LoginPage/></details></>;}
