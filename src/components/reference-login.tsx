'use client';
import { EmailAccount } from './email-account';
import { LoginPage } from './auth-pages';
import { PageTitle } from './shared';
import { safeReturnPath } from './auth-navigation';
export function ReferenceLogin(){return <><PageTitle title="Sign in">Return to your saved registrations, entries and receipts.</PageTitle><EmailAccount onSignedIn={()=>window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get('next'))||'/dashboard')}/><details><summary>Administrator or judge sign-in</summary><LoginPage/></details></>;}
