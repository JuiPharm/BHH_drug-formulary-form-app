import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../src/index.mjs';

const driveEnv = {
  GAS_BRIDGE_URL: 'https://script.google.com/macros/s/AKfycbSyntheticStagingToken/exec',
  GAS_BRIDGE_SECRET: 'synthetic-secret-for-staging-bridge-not-a-live-credential-123',
  DRIVE_UPLOAD_ENABLED: 'true'
};
const ctx = { access: { aud: 'test-access-app', getIdentity: async () => ({ email: 'pharm@example.test' }) } };
const rootId='STAGING_FOLDER_ROOT_1234567890';
const folderMap = {
  root: { id:rootId, name:'TEST-DF', url:'https://drive.google.com/fake-root' },
  folders:Object.fromEntries(Array.from({length:14},(_,i)=>['FOLDER_'+i,{
    id:'FOLDER_ID_'+i,name:'Folder_'+i,url:'https://drive.google.com/fake'
  }]))
};
function stubDb(throwOnSave=false,initialized=true) {
  const rows=[];
  return {
    rows,
    prepare(sql){
      return {
        sql,
        params:[],
        bind(...args){ this.params=args;return this;},
        async first(){
          if(sql.includes('FROM hospital_users')){
            return {id:'STAFF-1',email:'pharm@example.test',is_active:1,role:'PHARMACIST'};
          }
          if(sql.includes('COALESCE(MAX(version)'))return {latest:1};
          if(sql.includes('FROM submissions s LEFT JOIN submission_drive_folders')) {
            return {
              id:'TEST-S1',submission_no:'TEST-DF-001',brand_name:'TEST MEDICINE',
              strength:'1 mg',dosage_form:'Tablet',root_folder_id:initialized?rootId:null
            };
          }
          return null;
        }
      };
    },
    async batch(statements){
      if(throwOnSave)throw new Error('Simulated D1 failure');
      rows.push(...statements);
      return statements.map(()=>({success:true,results:[]}));
    }
  };
}
function req(bytes,type='RESEARCH_EVIDENCE',name='synthetic.pdf',mime='application/pdf'){
  return new Request('https://preprod.test/api/admin/submissions/TEST-S1/documents?type='+encodeURIComponent(type)+
    '&filename='+encodeURIComponent(name),{method:'POST',headers:{'content-type':mime},body:bytes});
}
function mockBridge({onCommand=()=>{}}={}){
  return async (url,opts)=>{
    assert.equal(url,driveEnv.GAS_BRIDGE_URL);
    assert.equal(opts.method,'POST');
    const command=JSON.parse(Buffer.from(JSON.parse(opts.body).payloadBase64,'base64').toString());
    onCommand(command);
    if(command.operation==='createSubmissionFolders')return Response.json({success:true,data:folderMap});
    if(command.operation==='deleteDocument')return Response.json({success:true,data:{trashed:true}});
    if(command.operation==='uploadDocument'){
      const bytes=Buffer.from(command.payload.base64Data,'base64');
      return Response.json({success:true,data:{
        fileId:'SYNTHETIC_DRIVE_FILE_12345',
        fileName:'RESEARCH_EVIDENCE_TEST-DF-001_v02_synthetic.pdf',
        sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')
      }});
    }
    throw Error('unexpected operation');
  };
}
test('legacy DriveApp upload remains disabled until bridge is configured',async()=>{
  const res=await worker.fetch(req(new TextEncoder().encode('%PDF-1.7')),
    {DB:stubDb(),CF_ACCESS_AUD:'test-access-app'},ctx);
  assert.equal(res.status,503);
  assert.equal((await res.json()).error,'DRIVE_UPLOAD_NOT_CONFIGURED');
});
test('rejects wrong MIME/signature before calling Apps Script',async()=>{
  let called=false;
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>{called=true;throw Error('unexpected network');};
  try {
    const env={DB:stubDb(),CF_ACCESS_AUD:'test-access-app',...driveEnv};
    const bad=await worker.fetch(req(new Uint8Array([1,2,3,4])),env,ctx);
    assert.equal(bad.status,400);
    assert.equal((await bad.json()).error,'INVALID_FILE_SIGNATURE');
    const mime=await worker.fetch(req(new TextEncoder().encode('%PDF-1.7'),
      'RESEARCH_EVIDENCE','synthetic.pdf','text/plain'),env,ctx);
    assert.equal(mime.status,400);
    assert.equal(called,false);
  }finally{globalThis.fetch=previous;}
});
test('missing original submission folder must be initialized before upload',async()=>{
  const res=await worker.fetch(req(new TextEncoder().encode('%PDF-1.7')),
    {DB:stubDb(false,false),CF_ACCESS_AUD:'test-access-app',...driveEnv},ctx);
  assert.equal(res.status,409);
  assert.equal((await res.json()).error,'DRIVE_FOLDER_NOT_INITIALIZED');
});
test('staff upload preserves original filename and stores only file ID in D1',async()=>{
  const previous=globalThis.fetch;
  let called=0;
  globalThis.fetch=mockBridge({onCommand(cmd)=>{
    called++;
    assert.equal(cmd.operation,'uploadDocument');
    assert.equal(cmd.payload.documentType,'RESEARCH_EVIDENCE');
    assert.equal(cmd.payload.fileName,'synthetic.pdf');
    assert.equal(cmd.payload.rootFolderId,rootId);
    assert.equal(cmd.payload.submissionNo,'TEST-DF-001');
    assert.equal(cmd.payload.version,2);
  }});
  const db=stubDb();
  try{
    const bytes=new TextEncoder().encode('%PDF-1.7\nSynthetic content');
    const res=await worker.fetch(req(bytes),{DB:db,CF_ACCESS_AUD:'test-access-app',...driveEnv},ctx);
    assert.equal(res.status,201);
    const result=await res.json();
    assert.equal(result.type,'RESEARCH_EVIDENCE');
    assert.equal(result.version,2);
    assert.equal(result.sizeBytes,bytes.length);
    assert.equal(Object.hasOwn(result,'fileId'),false);
    assert.equal(db.rows.length,2);
    assert.equal(db.rows[0].params[4],'SYNTHETIC_DRIVE_FILE_12345');
    assert.equal(called,1);
  }finally{globalThis.fetch=previous;}
});
test('D1 write failure triggers signed bridge trash operation',async()=>{
  const previous=globalThis.fetch;
  const operations=[];
  globalThis.fetch=mockBridge({onCommand:cmd=>operations.push(cmd.operation)});
  try{
    const res=await worker.fetch(req(new TextEncoder().encode('%PDF-1.7\nrollback')),
      {DB:stubDb(true),CF_ACCESS_AUD:'test-access-app',...driveEnv},ctx);
    assert.equal(res.status,500);
    assert.equal((await res.json()).error,'DOCUMENT_SAVE_FAILED');
    assert.deepEqual(operations,['uploadDocument','deleteDocument']);
  }finally{globalThis.fetch=previous;}
});
test('staff can initialize same 14-folder hierarchy through signed staging bridge',async()=>{
  const previous=globalThis.fetch;
  const db=stubDb(false,false);
  let called=false;
  globalThis.fetch=mockBridge({onCommand:cmd=>{
    called=true;
    assert.equal(cmd.operation,'createSubmissionFolders');
    assert.equal(cmd.payload.submissionNo,'TEST-DF-001');
    assert.equal(cmd.payload.product.brandName,'TEST MEDICINE');
  }});
  try{
    const res=await worker.fetch(new Request(
      'https://preprod.test/api/admin/submissions/TEST-S1/drive-folders',{method:'POST'}
    ),{DB:db,CF_ACCESS_AUD:'test-access-app',...driveEnv},ctx);
    assert.equal(res.status,201);
    assert.equal((await res.json()).folderCount,14);
    assert.equal(called,true);
    assert.equal(db.rows[0].params[1],rootId);
    assert(db.rows[0].sql.includes('submission_drive_folders'));
  }finally{globalThis.fetch=previous;}
});
