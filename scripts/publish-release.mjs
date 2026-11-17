import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const repo = 'rareLuoyezhiqiu/-';
const tag = 'v0.2.0-alpha.1';
const revision = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Commit changes and finish checks before publishing');
const credentials=execFileSync('git',['-c','credential.interactive=false','credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'},stdio:['pipe','pipe','pipe']});
const token=credentials.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
if(!token)throw Error('No GitHub credential available; sign in with Git Credential Manager');
const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'inspiration-release'};
async function api(path,options={}) {
 const response=await fetch(path.startsWith('https:')?path:`https://api.github.com/repos/${repo}${path}`,{...options,headers:{...headers,...options.headers}});
 if(!response.ok)throw Error(`GitHub request failed: HTTP ${response.status} (${new URL(response.url).pathname})`);
 return response.json();
}
const apk=await readFile('release/inspiration-list-0.2.0-alpha.1.apk');
const hash=createHash('sha256').update(apk).digest('hex');
const sums=await readFile('release/SHA256SUMS.txt');if(!sums.toString().startsWith(hash))throw Error('APK checksum mismatch');
const notes=await readFile('docs/releases/v0.2.0-alpha.1.md','utf8');
// First create a draft. It becomes downloadable only after both verified assets are uploaded.
let release;
try {release=await api(`/releases/tags/${tag}`);}catch(error){if(!error.message.includes('HTTP 404'))throw error;}
if(release && !release.draft)throw Error('Release already published; do not overwrite a version');
release ??= await api('/releases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:revision,name:'灵感清单 0.2.0-alpha.1 · Android 测试版',body:notes,draft:true,prerelease:true})});
const upload=release.upload_url.split('{')[0];
for(const [name,content,type] of [['inspiration-list-0.2.0-alpha.1.apk',apk,'application/vnd.android.package-archive'],['SHA256SUMS.txt',sums,'text/plain']]){
 const existing=release.assets.find(a=>a.name===name);if(existing)throw Error(`Draft asset already exists: ${name}; verify draft before retrying`);
 const asset=await api(`${upload}?name=${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':type},body:content});
 if(asset.size!==content.length)throw Error('Uploaded asset size mismatch');
 if(asset.digest && asset.digest!==`sha256:${createHash('sha256').update(content).digest('hex')}`)throw Error('Uploaded asset checksum mismatch');
}
const published=await api(`/releases/${release.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,prerelease:true})});
console.log(JSON.stringify({url:published.html_url,tag,commit:revision,sha256:hash}));
