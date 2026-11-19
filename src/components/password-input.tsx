'use client';
import {useState,type InputHTMLAttributes} from 'react';

export function PasswordInput({label,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string}) {
 const [visible,setVisible]=useState(false);
 return <div className="password-control"><input {...props} type={visible?'text':'password'}/><button type="button" className="secondary password-toggle" aria-controls={props.id} aria-label={`${visible?'Hide':'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>{visible?'Hide':'Show'}</button></div>;
}
