"""Import reviewed PUBLIC page captures; never run WordPress or source JavaScript.

Requires Python beautifulsoup4 for this operator-only sync. CI consumes the checked-in
static result and never fetches WordPress or installs Python packages.
"""
from pathlib import Path
from urllib.parse import urljoin,urlparse,unquote
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup,Comment
import hashlib,json,re,urllib.request

ROOT=Path(__file__).resolve().parent.parent
CAPTURE=ROOT/'.local/source-design-20261112/pages'
ASSETS=ROOT/'public/reference-20261112'
ASSETS.mkdir(exist_ok=True)
ORIGIN='https://youthecosummit.com'
records=[json.loads(p.read_text(encoding='utf-8')) for p in sorted(CAPTURE.glob('*.json'))]
assert len(records)==15
media=set()
def absolute(value,base=ORIGIN+'/'):
 return urljoin(base,value)
def is_asset(url):
 parsed=urlparse(url)
 return parsed.hostname=='youthecosummit.com' and re.search(r'\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|mp4|webm|pdf)$',parsed.path,re.I)
def collect(value,base=ORIGIN+'/'):
 url=absolute(value,base)
 if is_asset(url):media.add(url)
 return url
# Public interactive winner panels are captured in an isolated browser, never account data.
winner_panels=json.loads((CAPTURE.parent/'winner-panels.json').read_text(encoding='utf-8'))
winners=json.loads((ROOT/'.local/winners-extracted.json').read_text(encoding='utf-8'))
for panel in winner_panels.values():
 for a in BeautifulSoup(panel,'html.parser').select('a[href]'):collect(a['href'])
css_sources={}
for record in records:
 for href in record['styles']:
  url=absolute(href)
  assert urlparse(url).hostname=='youthecosummit.com'
  if url not in css_sources:
   with urllib.request.urlopen(url,timeout=35) as response:css_sources[url]=response.read().decode('utf-8')
 for html in [record['main'],record['header'],record['footer']]:
  soup=BeautifulSoup(html,'html.parser')
  for element in soup.find_all(True):
   for attr in ['src','poster','data-desktop-src','data-mobile-src']:
    if element.get(attr):collect(element[attr])
   for candidate in element.get('srcset','').split(','):
    if candidate.strip():collect(candidate.strip().split()[0])
   if element.name=='a' and element.get('href'):collect(element['href'])
   for candidate in re.findall(r'url\([\s\"\']*([^\)\"\']+)',element.get('style','')):collect(candidate)
for url,css in css_sources.items():
 for candidate in re.findall(r'url\([\s\"\']*([^\)\"\']+)',css):collect(candidate,url)

def download(url):
 with urllib.request.urlopen(url,timeout=90) as response:
  kind=response.headers.get('Content-Type','').split(';')[0]
  body=response.read(95*1024*1024+1)
 assert len(body)<=95*1024*1024,'Public asset exceeds Git single-file allowance; arrange separate public media delivery'
 assert kind!='text/html','Asset unexpectedly returned HTML'
 digest=hashlib.sha256(body).hexdigest()
 ext=Path(unquote(urlparse(url).path)).suffix.lower()
 target=ASSETS/(digest[:16]+ext)
 if target.exists():assert hashlib.sha256(target.read_bytes()).hexdigest()==digest
 else:target.write_bytes(body)
 return {'source':url,'path':'/reference-20261112/'+target.name,'bytes':len(body),'sha256':digest,'contentType':kind}
with ThreadPoolExecutor(max_workers=4) as pool:assets=list(pool.map(download,sorted(media)))
lookup={item['source']:item['path'] for item in assets}
def rewrite(value,base=ORIGIN+'/'):
 if value.startswith(('#','?')):return value
 url=absolute(value,base)
 if url in lookup:return lookup[url]
 p=urlparse(url)
 if p.hostname=='youthecosummit.com':return (p.path.rstrip('/') or '/')+('?' +p.query if p.query else '')+('#'+p.fragment if p.fragment else '')
 return value

def clean(record):
 soup=BeautifulSoup(record['main'],'html.parser')
 assert not soup.select('form'),'Transactional forms must remain on the existing implementation'
 for element in soup.select('script,iframe,object,embed,template,noscript,style'):element.decompose()
 for node in soup.find_all(string=lambda text:isinstance(text,Comment)):node.extract()
 for element in soup.find_all(True):
  for attr in list(element.attrs):
   if attr.lower().startswith('on'):del element[attr]
  for attr in ['href','src','poster','data-desktop-src','data-mobile-src']:
   if element.get(attr):
    assert not re.match(r'\s*(?:javascript|vbscript|data):',element[attr],re.I)
    element[attr]=rewrite(element[attr])
  if element.get('srcset'):
   element['srcset']=', '.join(' '.join([rewrite(parts[0]),*parts[1:]]) for value in element['srcset'].split(',') if (parts:=value.strip().split()))
  if element.get('style'):
   style=element['style']
   style=re.sub(r'url\([\s\"\']*([^\)\"\']+)[\s\"\']*\)',lambda m:'url("'+rewrite(m[1])+'")',style)
   # Capture is SSR, so no animation state or source scripts are carried over.
   if 'data-reveal' in element.attrs or 'data-hero-copy' in element.attrs or 'data-enter-media' in element.attrs:
    style=re.sub(r'(?:opacity|transform)\s*:[^;]+;?','',style)
   element['style']=style
  if element.name=='a' and element.get('target')=='_blank':element['rel']=['noopener','noreferrer']
 main=soup.find('main');assert main is not None and main.find('h1')
 for status in main.select('[role=status]'):
  if status.get_text(strip=True) in ['Loading…','Loading...','Loading page…']:
   if record['path']=='/showcase':
    status.name='div';status.attrs={'data-live-publications':'true'};status.clear()
   elif record['path']=='/contact':
    config=json.loads((ROOT/'.local/source-design-20261112/public-config.json').read_text(encoding='utf-8'))['data']
    contact=next((x for x in config['content'] if x['key']=='contact'),{})
    copy=re.sub(r'\[[^\]]+\]','',contact.get('body',''))
    paragraph=soup.new_tag('p',attrs={'class':'prose'});paragraph.string=' '.join(copy.split())
    link=soup.new_tag('a',href='/forms/legacy-12146',attrs={'class':'yes-button'});link.string='Send a message ↗'
    status.replace_with(paragraph);paragraph.insert_after(link)
   else:status.decompose()
 html=''.join(str(child) for child in main.contents)
 return {'html':html,'sourceSha256':record['sourceSha256'],'title':record['title']}

pages={record['path']:clean(record) for record in records}
winner_data={'records':winners,'panels':{year:clean({'main':'<main><h1>Winners</h1>'+panel+'</main>','path':'/winners','title':'','sourceSha256':''})['html'].replace('<h1>Winners</h1>','') for year,panel in winner_panels.items()}}
(ROOT/'src/data/live-winners.json').write_text(json.dumps(winner_data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
css=[]
for url,source in css_sources.items():
 source=re.sub(r'url\([\s\"\']*([^\)\"\']+)[\s\"\']*\)',lambda m:'url("'+rewrite(m[1],url)+'")',source)
 css.append('/* Public source: '+url+' */\n'+source)
payload={'capturedAt':'2026-11-12','source':ORIGIN,'pages':pages,'assets':assets,'styles':[{'source':url,'sha256':hashlib.sha256(text.encode()).hexdigest()} for url,text in css_sources.items()]}
(ROOT/'src/data/live-presentation.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
(ROOT/'src/data/live-brand.json').write_text(json.dumps({key:next(item['path'] for item in assets if item['source'].endswith(suffix)) for key,suffix in [('logo','/images/logo.png'),('socialImage','/images/students.jpg')]})+'\n',encoding='utf-8')
(ROOT/'src/app/live-presentation.css').write_text('\n'.join(css)+'\n',encoding='utf-8')
print(json.dumps({'pages':len(pages),'assets':len(assets),'bytes':sum(a['bytes'] for a in assets),'styles':len(css),'largestAssets':sorted([{'source':a['source'],'bytes':a['bytes']} for a in assets],key=lambda a:a['bytes'],reverse=True)[:5]}))
