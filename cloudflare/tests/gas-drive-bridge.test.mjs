import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend/apps-script');
const files = ['Config.gs', 'Utils.gs', 'DriveService.gs', 'ValidationService.gs', 'CloudflareDriveBridge.gs'];
const source=files.map(name=>fs.readFileSync(path.join(base,name),'utf8')).join('\n');
const secret='synthetic-bridge-secret-hmac-32-characters-minimum!!';

class Folder {
  constructor(id,name,parent,registry){
    this.id=id;this.name=name;this.parent=parent;this.registry=registry;
    this.children=[];this.files=[];this.trashed=false;
    registry.set(id,this);
  }
  getId(){return this.id;}
  getName(){return this.name;}
  getUrl(){return 'https://drive.google.com/folders/'+this.id;}
  getParents(){return this.iterate(this.parent?[this.parent]:[]);}
  iterate(items){
    return {hasNext(){return items.length>0;},next(){return items.shift();}};
  }
  getFoldersByName(name){
    return this.iterate(this.children.filter(f=>f.name===name));
  }
  createFolder(name){
    const id='TEST_FOLDER_'+crypto.randomUUID().replaceAll('-','');
    const child=new Folder(id,name,this,this.registry);
    this.children.push(child);
    return child;
  }
  createFile(blob){
    const file={
      id:'TEST_FILE_'+crypto.randomUUID().replaceAll('-',''),
      name:blob.name,
      parent:this,
      trashed:false,
      getId(){return this.id;},
      getUrl(){return 'https://drive.google.com/file/d/'+this.id;},
      getParents(){return {hasNext:()=>true,next:()=>this.parent};},
      setTrashed(value){this.trashed=value;}
    };
    this.files.push(file);
    this.registry.set(file.id,file);
    return file;
  }
}
function build(){
  const all=new Map(), cache=new Map();
  const prod=new Folder('PRODUCTION_ROOT_123456789','Production',null,all);
  const stage=new Folder('STAGING_ROOT_123456789','BHH-PREPROD',null,all);
  const values={
    BHH_BRIDGE_SECRET:secret,
    BHH_BRIDGE_STAGING_FOLDER_ID:stage.getId(),
    DRUG_FORMULARY_MAIN_FOLDER_ID:prod.getId()
  };
  const scope={
    console,Date,JSON,Object,Number,String,Math,Error,RegExp,
    CacheService:{getScriptCache(){return {
      get(key){return cache.get(key)||null;},
      put(key,value){cache.set(key,value);}
    };}},
    LockService:{getScriptLock(){return {waitLock(){},releaseLock(){}};}},
    PropertiesService:{getScriptProperties(){return {getProperty(key){return values[key]||null;}};}},
    DriveApp:{
      getFolderById(id){const item=all.get(id);if(!(item instanceof Folder))throw Error('Missing Drive folder');return item;},
      getFileById(id){const item=all.get(id);if(!item||item instanceof Folder)throw Error('Missing Drive file');return item;}
    },
    Utilities:{
      Charset:{UTF_8:'UTF-8'},
      formatDate(date,tz,format){
        assert.equal(tz,'Asia/Bangkok');
        if(format==='yyyy')return String(new Date(date).getUTCFullYear());
        throw Error('unexpected format');
      },
      computeHmacSha256Signature(message,key){
        return Array.from(crypto.createHmac('sha256',key).update(message).digest());
      },
      base64Decode(value){return [...Buffer.from(value,'base64')].map(x=>x>127?x-256:x);},
      computeDigest(_algorithm,bytes){
        return Array.from(crypto.createHash('sha256').update(Uint8Array.from(bytes.map(x=>x<0?x+256:x))).digest());
      },
      DigestAlgorithm:{SHA_256:'SHA_256'},
      newBlob(bytes,mime,name){
        const data=Buffer.from(bytes.map(x=>x<0?x+256:x));
        return {
          name:name||'',
          mime,
          getDataAsString(){return data.toString('utf8');},
          setName(newName){this.name=newName;return this;}
        };
      }
    },
    getSystemSettings_(){return {MAX_FILE_SIZE_MB:'10'};}
  };
  vm.createContext(scope);
  vm.runInContext(source,scope);
  function signed(operation,payload,nonce=crypto.randomUUID(),timestamp=String(Date.now())){
    const payloadBase64=Buffer.from(JSON.stringify({operation,payload})).toString('base64');
    const message=timestamp+'\n'+nonce+'\n'+payloadBase64;
    return {
      action:'cloudflareBridge',payloadBase64,
      bridgeAuth:{
        timestamp,nonce,
        signature:crypto.createHmac('sha256',secret).update(message).digest('hex')
      }
    };
  }
  return {scope,stage,prod,all,cache,values,signed};
}

test('legacy folder names and number of subfolders match production definitions',()=>{
  const {scope,stage,signed}=build();
  const cmd=signed('createSubmissionFolders',{
    submissionNo:'BHH-TEST-001',
    product:{brandName:'Synthetic',strength:'1 mg',dosageForm:'Tablet'}
  });
  const first=scope.processCloudflareBridge_(cmd);
  const second=scope.processCloudflareBridge_(signed('createSubmissionFolders',{
    submissionNo:'BHH-TEST-001',
    product:{brandName:'Synthetic',strength:'1 mg',dosageForm:'Tablet'}
  }));
  assert.equal(first.root.id,second.root.id);
  assert.equal(Object.keys(first.folders).length,14);
  assert.equal(stage.children.length,1);
  assert.equal(stage.children[0].children.length,1);
  const root=stage.children[0].children[0];
  assert.equal(root.children.length,14);
  assert.equal(root.children[0].name,'01_Quotation_TMT');
  assert.equal(root.children[8].name,'09_Research_Evidence');
  assert.equal(root.children[10].name,'11_Generated_Physician_Form');
  assert.equal(root.children[13].name,'99_Archived_Versions');
});

test('HMAC reject invalid/replayed/expired command before Drive access',()=>{
  const {scope,signed,stage}=build();
  const good=signed('ping',{});
  assert.equal(scope.processCloudflareBridge_(good).mode,'STAGING');
  assert.throws(()=>scope.processCloudflareBridge_(good),/Repeated bridge request/);
  const bad=signed('ping',{});
  bad.bridgeAuth.signature='0'.repeat(64);
  assert.throws(()=>scope.processCloudflareBridge_(bad),/Invalid bridge signature/);
  const old=signed('ping',{},crypto.randomUUID(),String(Date.now()-400000));
  assert.throws(()=>scope.processCloudflareBridge_(old),/Expired bridge request/);
  assert.equal(stage.children.length,0);
});

test('staging root cannot be the production root',()=>{
  const {scope,values,signed,prod}=build();
  values.BHH_BRIDGE_STAGING_FOLDER_ID=prod.getId();
  assert.throws(()=>scope.processCloudflareBridge_(signed('createSubmissionFolders',{
    submissionNo:'BHH-TEST-001',
    product:{brandName:'Synthetic',strength:'1 mg',dosageForm:'Tablet'}
  })),/different staging folder/);
});

test('upload uses original stored filename, checksum and type-specific folder',()=>{
  const {scope,all,signed,stage}=build();
  const info=scope.processCloudflareBridge_(signed('createSubmissionFolders',{
    submissionNo:'BHH-TEST-001',
    product:{brandName:'Synthetic',strength:'1 mg',dosageForm:'Tablet'}
  }));
  const bytes=Buffer.from('%PDF-1.7\nsynthetic');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const result=scope.processCloudflareBridge_(signed('uploadDocument',{
    submissionId:'S-TEST-001',
    submissionNo:'BHH-TEST-001',
    documentType:'RESEARCH_EVIDENCE',
    version:2,
    fileName:'Synthetic Study.pdf',
    mimeType:'application/pdf',
    rootFolderId:info.root.id,
    sha256,
    base64Data:bytes.toString('base64')
  }));
  assert.equal(result.sha256,sha256);
  assert.equal(result.fileName,'RESEARCH_EVIDENCE_BHH-TEST-001_v02_Synthetic_Study.pdf');
  const file=all.get(result.fileId);
  assert.equal(file.parent.name,'09_Research_Evidence');
  assert.equal(stage.children[0].children[0].children[8].files.length,1);
  const deleted=scope.processCloudflareBridge_(signed('deleteDocument',{fileId:result.fileId}));
  assert.equal(deleted.trashed,true);
  assert.equal(file.trashed,true);
});

test('upload cannot target production Drive folder or supply incorrect hash',()=>{
  const {scope,signed,prod}=build();
  const bytes=Buffer.from('%PDF-1.7\nsynthetic');
  const payload={
    submissionId:'S-TEST-001',submissionNo:'BHH-TEST-001',
    documentType:'RESEARCH_EVIDENCE',version:1,
    fileName:'Test.pdf',mimeType:'application/pdf',
    rootFolderId:prod.getId(),base64Data:bytes.toString('base64'),
    sha256:crypto.createHash('sha256').update(bytes).digest('hex')
  };
  assert.throws(()=>scope.processCloudflareBridge_(signed('uploadDocument',payload)),/Not a staging submission folder|Submission folder has no parent/);
  assert.throws(()=>scope.processCloudflareBridge_(signed('uploadDocument',{
    ...payload,sha256:'0'.repeat(64)
  })),/File checksum mismatch/);
});
