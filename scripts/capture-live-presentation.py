from pathlib import Path
from bs4 import BeautifulSoup,Comment
from concurrent.futures import ThreadPoolExecutor
import urllib.request,json,hashlib
root=Path(__file__).resolve().parent.parent/'.local/source-design-20261112';out=root/'pages';out.mkdir(parents=True,exist_ok=True)
paths=['/','/about','/students','/parents','/teachers-schools','/competitions','/how-to-participate','/awards','/experience','/partners','/resources','/showcase','/faq','/contact','/get-involved']
def fetch(path):
 name='home' if path=='/' else path.strip('/').replace('/','-')
 with urllib.request.urlopen('https://youthecosummit.com'+path+'/' if path!='/' else 'https://youthecosummit.com/',timeout=35) as r:body=r.read()
 (out/(name+'.html')).write_bytes(body)
 soup=BeautifulSoup(body.decode('utf-8'),'html.parser');main=soup.find('main')
 assert main is not None
 # React streams public page content into a hidden sibling. Resolve only that known boundary, never execute scripts.
 template=main.find('template')
 if template and template.get('id','').startswith('B:'):
  content=soup.find(id=template['id'].replace('B:','S:',1))
  assert content is not None,(path,'Missing streamed content')
  main.clear()
  for child in list(content.contents):main.append(child.extract())
 styles=[x.get('href') for x in soup.select('link[rel=stylesheet]')]
 value={'path':path,'main':str(main),'header':str(soup.find('header')),'footer':str(soup.find('footer')),'styles':styles,'title':soup.title.get_text() if soup.title else '', 'sourceSha256':hashlib.sha256(body).hexdigest()}
 (out/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
 return {'path':path,'bytes':len(body),'headings':[e.get_text(' ',strip=True) for e in main.select('h1,h2')],'forms':len(main.select('form')),'controls':[(e.name,dict(e.attrs),e.get_text(' ',strip=True)[:80]) for e in main.select('button,input')][:25]}
with ThreadPoolExecutor(max_workers=4) as pool:result=list(pool.map(fetch,paths))
(root/'page-inventory.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
for page in result:print(json.dumps({k:v for k,v in page.items() if k!='controls'},ensure_ascii=True))
with urllib.request.urlopen('https://youthecosummit.com/wp-json/yes/v1/public/config',timeout=35) as response:
 (root/'public-config.json').write_bytes(response.read())
