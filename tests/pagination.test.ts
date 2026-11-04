import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pagination } from '../src/components/shared';

describe('pagination embedded in registration forms', () => {
 it('renders enabled page controls as non-submitting buttons', () => {
  const html=renderToStaticMarkup(createElement('form',null,createElement(Pagination,{page:2,total:80,pageSize:25,onPage:()=>{}})));
  const buttons=html.match(/<button\b[^>]*>/g) || [];
  expect(buttons).toHaveLength(2);
  for(const button of buttons){expect(button).toContain('type="button"');expect(button).not.toContain('disabled');}
 });
 it('keeps boundary buttons disabled without allowing either to submit a parent form', () => {
  const html=renderToStaticMarkup(createElement(Pagination,{page:1,total:0,onPage:()=>{}}));
  const buttons=html.match(/<button\b[^>]*>/g) || [];
  expect(buttons).toHaveLength(2);
  for(const button of buttons){expect(button).toContain('type="button"');expect(button).toContain('disabled');}
 });
});
