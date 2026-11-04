// Planning calculator: provider unit prices are inputs, never invented quotations.
const values=Object.fromEntries(process.argv.slice(2).map(arg=>arg.split('=')));
const number=(key:string,fallback=0)=>{const value=Number(values[key]??fallback);if(!Number.isFinite(value)||value<0)throw new Error(`Invalid ${key}`);return value;};
const files=number('entries')*number('filesPerEntry',1),originalGB=files*number('averageMB')/1000;
const retainedGB=originalGB*number('versions',1)*(1+number('previewFraction'))*number('copies',2);
const transferGB=originalGB*number('viewsPerFile',1);
console.log(JSON.stringify({files,originalGB,retainedGB,transferGB,monthlyEstimate:{storage:retainedGB*number('pricePerGBMonth'),transfer:transferGB*number('pricePerGBTransfer'),otp:number('otpMessages')*number('pricePerOTP'),hosting:number('hostingMonthly'),database:number('databaseMonthly')},note:'Supply provider quotes, peak concurrency, retention and traffic assumptions; estimates exclude tax and unlisted request fees.'},null,2));
