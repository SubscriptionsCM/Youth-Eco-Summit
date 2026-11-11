import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {ReferenceControl} from '../src/components/reference-form';
import {referenceForms} from '../src/domain/wordpress-forms';
it('renders separate required contact name inputs with saved values and explicit labels',()=>{
 const field=referenceForms.find(f=>f.key==='legacy-12146')!.fields.find(f=>f.id==='name-3')!;
 const html=renderToStaticMarkup(createElement(ReferenceControl,{field,answers:{'name-3':{'last-name':'Singh','first-name':'Asha'}},change:()=>{},formKey:'legacy-12146',record:{},token:'',refresh:async()=>{}}));
 expect(html).toMatch(/<input(?=[^>]*name="name-3-first-name")(?=[^>]*required="")[^>]*>/);expect(html).toContain('First Name');expect(html).toContain('value="Asha"');expect(html).toContain('autoComplete="given-name"');
 expect(html).toMatch(/<input(?=[^>]*name="name-3-last-name")(?=[^>]*required="")[^>]*>/);expect(html).toContain('Last Name');expect(html).toContain('value="Singh"');expect(html).not.toContain('name="name-3-middle-name"');expect(html).not.toContain('[object Object]');
});
