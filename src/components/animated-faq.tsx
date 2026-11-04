'use client';

import { useId, useState, type ReactNode } from 'react';
import './animated-faq.css';

type AnimatedFAQProps = {
  question: string;
  children: ReactNode;
  index?: string | number;
  className?: string;
};

export function AnimatedFAQ({ question, children, index, className = '' }: AnimatedFAQProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonId = `faq-trigger-${id}`;
  const panelId = `faq-panel-${id}`;

  return (
    <div className={`animated-faq ${className}`.trim()} data-open={open}>
      <h3 className="animated-faq-heading">
        <button
          type="button"
          className="animated-faq-trigger"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(current => !current)}
        >
          {index !== undefined && <span className="animated-faq-index" aria-hidden="true">{typeof index === 'number' ? String(index).padStart(2, '0') : index}</span>}
          <span className="animated-faq-question">{question}</span>
          <span className="animated-faq-symbol" aria-hidden="true">+</span>
        </button>
      </h3>
      <div
        className="animated-faq-panel"
        id={panelId}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="animated-faq-clip">
          <div className="animated-faq-answer">{children}</div>
        </div>
      </div>
    </div>
  );
}
