'use client';
import './form-steps.css';

export function FormSteps({ steps, current }: { steps: string[]; current: number }) {
 return <nav className="form-steps" aria-label="Form progress"><p>Step {current + 1} of {steps.length}</p><ol>{steps.map((step, index) => <li key={step} aria-current={index === current ? 'step' : undefined} data-complete={index < current}><span aria-hidden="true">{index < current ? '✓' : index + 1}</span><strong>{step}</strong></li>)}</ol></nav>;
}
