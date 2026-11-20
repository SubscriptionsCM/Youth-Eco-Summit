/** Spreadsheet-safe CSV cell encoding; safe to import in browsers. */
export function csvCell(value:unknown){let text=value==null?'':String(value);if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
