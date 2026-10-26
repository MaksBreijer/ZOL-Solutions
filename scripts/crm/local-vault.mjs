import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt);
const idleLimit=15*60*1000, absoluteLimit=8*60*60*1000;
function encrypt(key,data,aad){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('zol-vault-v1:'+aad));const cipher=Buffer.concat([c.update(data),c.final()]);return {iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),cipher:cipher.toString('base64')};}
function decrypt(key,box,aad){const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'base64'));d.setAAD(Buffer.from('zol-vault-v1:'+aad));d.setAuthTag(Buffer.from(box.tag,'base64'));return Buffer.concat([d.update(Buffer.from(box.cipher,'base64')),d.final()]);}
export class LocalVault{
 constructor(root){this.root=root;this.key=null;this.sessions=new Map();this.failures=0;this.nextAttempt=0;fs.mkdirSync(root,{recursive:true,mode:0o700});fs.chmodSync(root,0o700);this.configPath=path.join(root,'vault.json');}
 configured(){return fs.existsSync(this.configPath);}
 async derive(password,salt){return scrypt(password,Buffer.from(salt,'base64'),32,{N:131072,r:8,p:1,maxmem:256*1024*1024});}
 async setup(password){
  if(this.configured())throw Error('Deze kluis bestaat al. Log in met je wachtwoord.');
  if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('Gebruik een wachtwoordzin van minimaal 12 tekens.');
  const salt=crypto.randomBytes(32).toString('base64'),key=await this.derive(password,salt);
  try{fs.writeFileSync(this.configPath,JSON.stringify({version:1,salt,check:encrypt(key,Buffer.from('ZOL CRM kluis'),'check')}),{mode:0o600,flag:'wx'});}catch(e){key.fill(0);throw e;}
  this.key=key;return this.newSession();
 }
 async unlock(password){
  if(Date.now()<this.nextAttempt)throw Error('Te veel pogingen. Wacht even voordat je opnieuw probeert.');
  if(!this.configured())throw Error('Stel eerst je wachtwoord in.');
  if(typeof password!=='string'||password.length>1024)throw Error('Ongeldig wachtwoord.');
  const config=JSON.parse(fs.readFileSync(this.configPath,'utf8')),key=await this.derive(password,config.salt);
  try{if(decrypt(key,config.check,'check').toString()!=='ZOL CRM kluis')throw Error();}
  catch{key.fill(0);this.failures++;this.nextAttempt=Date.now()+Math.min(60000,1000*2**Math.min(this.failures,6));throw Error('Wachtwoord onjuist.');}
  if(this.key)this.key.fill(0);this.key=key;this.failures=0;this.nextAttempt=0;return this.newSession();
 }
 newSession(){const token=crypto.randomBytes(32).toString('hex');this.sessions.set(crypto.createHash('sha256').update(token).digest('hex'),{created:Date.now(),last:Date.now()});return token;}
 authenticated(cookie='',touch=true){
  const token=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('zol_session='))?.slice(12);if(!token||!this.key)return false;
  const hash=crypto.createHash('sha256').update(token).digest('hex'),s=this.sessions.get(hash);
  if(!s||Date.now()-s.last>idleLimit||Date.now()-s.created>absoluteLimit){this.sessions.delete(hash);this.prune();return false;}
  if(touch)s.last=Date.now();return true;
 }
 prune(){for(const [k,s] of this.sessions)if(Date.now()-s.last>idleLimit||Date.now()-s.created>absoluteLimit)this.sessions.delete(k);if(!this.sessions.size)this.lock();}
 lock(){this.sessions.clear();if(this.key)this.key.fill(0);this.key=null;}
 objectPath(k){return path.join(this.root,crypto.createHash('sha256').update(k).digest('hex')+'.enc');}
 read(k){if(!this.key)throw Error('De kluis is vergrendeld.');let text;try{text=fs.readFileSync(this.objectPath(k),'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}const box=JSON.parse(text);return JSON.parse(decrypt(this.key,box,k));}
 async get(k){const o=this.read(k);if(!o)return null;const raw=Buffer.from(o.data,'base64');return {etag:o.etag,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata,body:raw,json:async()=>JSON.parse(raw),text:async()=>raw.toString()};}
 async put(k,value,options={}){
  const old=this.read(k);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;
  const raw=Buffer.from(typeof value==='string'?value:new Uint8Array(value)),o={etag:crypto.randomUUID(),httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{},data:raw.toString('base64')};
  const dest=this.objectPath(k),tmp=dest+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(encrypt(this.key,Buffer.from(JSON.stringify(o)),k)),{mode:0o600});fs.renameSync(tmp,dest);return {etag:o.etag};
 }
 async delete(k){if(!this.key)throw Error('De kluis is vergrendeld.');try{fs.unlinkSync(this.objectPath(k));}catch(e){if(e.code!=='ENOENT')throw e;}}
}
export function allowedLocalRequest(host,origin,fetchSite){return host==='127.0.0.1:5173'&&(!origin||origin==='http://127.0.0.1:5173')&&fetchSite!=='cross-site';}
