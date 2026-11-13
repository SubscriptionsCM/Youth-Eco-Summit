import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {ReferenceControl} from '../src/components/reference-form';
import {referenceForms} from '../src/domain/wordpress-forms';

function selected(value:unknown){
 const field=referenceForms.find(form=>form.key==='teacher')!.fields.find(field=>field.id==='select-1')!;
 const answers={'select-1':value};
 const html=renderToStaticMarkup(createElement(ReferenceControl,{field,answers,change:()=>{},formKey:'teacher',record:{},token:'',refresh:async()=>{}}));
 expect(answers).toEqual({'select-1':value});
 return (html.match(/<option[^>]*selected=""[^>]*>/g)||[]).map(option=>option.match(/value="([^"]*)"/)![1]);
}
it('restores a single saved competition in the educator multiselect',()=>{
 expect(selected('open-letter')).toEqual(['open-letter']);
});
it('retains multiple saved competitions in the educator multiselect',()=>{
 expect(selected(['open-letter','blog-writing'])).toEqual(['open-letter','blog-writing']);
});
it('does not invent a competition for an empty saved value',()=>{
 expect(selected(undefined)).toEqual([]);
 expect(selected('')).toEqual([]);
});
