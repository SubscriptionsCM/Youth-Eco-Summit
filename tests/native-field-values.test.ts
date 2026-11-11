import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const php=['C:/xampp/php/php.exe','/usr/bin/php','/usr/local/bin/php'].find(existsSync);
describe.skipIf(!php)('native notification structured values',()=>{
 function execute(type:string,value:unknown){const result=spawnSync(php!,[resolve('tests/fixtures/notification-native-values.php'),resolve('wordpress/yes-next-account-bridge/notifications.php')],{input:JSON.stringify({type,value}),encoding:'utf8',windowsHide:true});expect(result.status).toBe(0);return JSON.parse(result.stdout);}
 it('maps canonical address aliases only for native mail rendering',()=>{
  expect(execute('address',{street_address:'10 QA Road',address_line:'QA Wing',address_city:'Delhi',address_state:'Delhi',address_zip:'110001',address_country:'India'})).toEqual({value:{street_address:'10 QA Road',address_line:'QA Wing',city:'Delhi',state:'Delhi',zip:'110001',country:'India'}});
 });
 it('preserves already-native address keys and rejects conflicting aliases',()=>{
  expect(execute('address',{city:'Delhi',address_city:'Delhi'})).toEqual({value:{city:'Delhi'}});
  expect(execute('address',{city:'Delhi',address_city:'Mumbai'})).toEqual({rejected:true});
 });
 it('does not reinterpret name objects or old scalar names',()=>{
  expect(execute('name',{'first-name':'Asha','last-name':'Singh'})).toEqual({value:{'first-name':'Asha','last-name':'Singh'}});
  expect(execute('name','Asha Singh')).toEqual({value:'Asha Singh'});
 });
});
