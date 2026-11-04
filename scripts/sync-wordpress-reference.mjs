import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Explicitly derived from the supplied sanitized reference, never from participant data.
const livePath=process.argv[2];
const input = await readFile(livePath||new URL('../../wordpress-reference/form-reference-2026-10-09.json', import.meta.url));
const raw = JSON.parse(input.toString('utf8'));
const original=JSON.parse(await readFile(new URL('../../wordpress-reference/form-reference-2026-10-09.json',import.meta.url),'utf8'));
const safeSettings=settings=>Object.fromEntries(Object.entries(settings||{}).filter(([key])=>['paginationData','store_submissions','form-type','submitData','registration-password-field','use_save_and_continue','sc_permission','logged-users','formName'].includes(key)));
const source=livePath?{captured_on:raw.capturedAt,config:original.config,forms:raw.records.filter(record=>record.kind==='form'&&/^\d+$/.test(record.sourceId)&&record.payload.definition?.fields).map(record=>({id:Number(record.sourceId),title:record.payload.post_title,status:record.payload.post_status,fields:record.payload.definition.fields,settings:safeSettings(record.payload.definition.settings)}))}:raw;
const keys = new Map(Object.entries(source.config).filter(([,v]) => typeof v === 'number').map(([k,v]) => [v,k]));
for (const [key,id] of Object.entries(source.config.entry_forms)) keys.set(id,key);
const catalogues = {};
const forms = source.forms.map(form => ({
 id: form.id, key: keys.get(form.id)||`legacy-${form.id}`, title: form.title, status: form.status,
 competition: Object.values(source.config.entry_forms).includes(form.id), settings: form.settings,
 fields: form.fields.map(field => {
  const value = { ...field,id:field.id||field.element_id };
  for (const key of ['options_bulk_editor','wrapper_id','form_id','cols','element_id','prefill','custom-class']) delete value[key];
  if (value.options?.length > 100) {
   const catalogue = createHash('sha256').update(JSON.stringify(value.options)).digest('hex').slice(0,12);
   catalogues[catalogue] = value.options; value.catalogue = catalogue; delete value.options;
  }
  return value;
 })
}));
await writeFile(new URL('../src/data/wordpress-forms.json', import.meta.url), JSON.stringify({ capturedAt: source.captured_on, sourceSha256: createHash('sha256').update(input).digest('hex'), forms, catalogues }));
console.log(`Retained ${forms.length} forms and ${Object.keys(catalogues).length} shared school catalogues. No submission data included.`);
