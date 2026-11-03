import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  hasDriveConfig, callLegacyDriveBridge, createSubmissionFoldersOnDrive,
  uploadDocumentToDrive, deleteDocumentFromDrive
} from '../src/drive-service.mjs';

const env = {
  GAS_BRIDGE_URL: 'https://script.google.com/macros/s/AKfycbSyntheticStagingToken/exec',
  GAS_BRIDGE_SECRET: 'preprod-synthetic-hmac-key-please-never-reuse-123456789'
};
const root = {
  root: { id:'STAGING_FOLDER_12345',name:'TEST_Drug',url:'https://drive.google.com/fake' },
  folders: Object.fromEntries(Array.from({length:14},(_,i)=>['FOLDER_'+i,{id:'F'+i,name:'f'+i,url:'https://drive.google.com/fake'}]))
};

function mockTransport(capture=()=>{}, fail=false) {
  return async (url, options) => {
    assert.equal(url, env.GAS_BRIDGE_URL);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['content-type'], 'text/plain;charset=utf-8');
    const request=JSON.parse(options.body);
    assert.equal(request.action, 'cloudflareBridge');
    const { timestamp, nonce, signature }=request.bridgeAuth;
    const expected=createHmac('sha256',env.GAS_BRIDGE_SECRET)
      .update(timestamp+'\n'+nonce+'\n'+request.payloadBase64).digest('hex');
    assert.equal(signature,expected);
    const command=JSON.parse(Buffer.from(request.payloadBase64,'base64').toString());
    capture(command);
    if(fail)return Response.json({success:false,data:null,error:{code:'REJECTED'}});
    if(command.operation==='createSubmissionFolders')return Response.json({success:true,data:root});
    if(command.operation==='deleteDocument')return Response.json({success:true,data:{trashed:true}});
    if(command.operation==='uploadDocument')return Response.json({success:true,data:{
      fileId:'SYNTHETIC_FILE_ID_123456',fileName:'RESEARCH_EVIDENCE_TEST-001_v01_Evidence.pdf',
      sha256:command.payload.sha256,sizeBytes:6
    }});
    return Response.json({success:true,data:{available:true}});
  };
}

test('No Google service account is required, but Apps Script HMAC secret is mandatory',async()=>{
  assert.equal(hasDriveConfig({}),false);
  assert.equal(hasDriveConfig({GAS_BRIDGE_URL:env.GAS_BRIDGE_URL,GAS_BRIDGE_SECRET:'short'}),false);
  assert.equal(hasDriveConfig(env),true);
  await assert.rejects(callLegacyDriveBridge({},'ping',{}),/not configured/);
});

test('HMAC signature covers operation and payload bytes for Apps Script',async()=>{
  const reply=await callLegacyDriveBridge(env,'ping',{},mockTransport(command=>{
    assert.equal(command.operation,'ping');
  }),1790000000000);
  assert.equal(reply.available,true);
});

test('Create folder command uses same product fields as original DriveApp',async()=>{
  const result=await createSubmissionFoldersOnDrive(env,{
    submissionNo:'TEST-001',
    product:{brandName:'Synthetic',strength:'1 mg',dosageForm:'Tablet'}
  },mockTransport(command=>{
    assert.equal(command.operation,'createSubmissionFolders');
    assert.equal(command.payload.submissionNo,'TEST-001');
    assert.equal(command.payload.product.brandName,'Synthetic');
  }));
  assert.equal(Object.keys(result.folders).length,14);
});

test('Binary upload is bridged as Base64 with original naming inputs and SHA256',async()=>{
  const bytes=new Uint8Array([0,1,2,3,4,255]);
  let checked=false;
  const stored=await uploadDocumentToDrive(env,{
    submissionId:'TEST-1',submissionNo:'TEST-001',rootFolderId:'STAGING_FOLDER_12345',
    documentType:'RESEARCH_EVIDENCE',version:1,fileName:'Evidence.pdf',
    mimeType:'application/pdf',bytes
  },mockTransport(command=>{
    assert.equal(command.operation,'uploadDocument');
    assert.equal(command.payload.fileName,'Evidence.pdf');
    assert.equal(command.payload.documentType,'RESEARCH_EVIDENCE');
    assert.equal(command.payload.rootFolderId,'STAGING_FOLDER_12345');
    assert.deepEqual(Buffer.from(command.payload.base64Data,'base64'),Buffer.from(bytes));
    checked=true;
  }));
  assert.equal(checked,true);
  assert.equal(stored.provider,'drive-apps-script');
  assert.equal(stored.sizeBytes,6);
  assert.equal(stored.fileId,'SYNTHETIC_FILE_ID_123456');
  assert.equal(stored.sha256.length,64);
});

test('Drive deletion is signed and scoped to bridge operation',async()=>{
  let checked=false;
  await deleteDocumentFromDrive(env,'SYNTHETIC_FILE_ID_123456',mockTransport(cmd=>{
    assert.equal(cmd.operation,'deleteDocument');
    assert.equal(cmd.payload.fileId,'SYNTHETIC_FILE_ID_123456');
    checked=true;
  }));
  assert.equal(checked,true);
});

test('Rejects invalid MIME, invalid filename, oversized uploads before network',async()=>{
  let called=0;
  const fail=async()=>{called++;throw Error('not expected');};
  const bad=[
    {fileName:'test.pdf',mimeType:'application/pdf',bytes:new Uint8Array()},
    {fileName:'test.pdf',mimeType:'application/pdf',bytes:new Uint8Array(10*1024*1024+1)},
    {fileName:'../test.pdf',mimeType:'application/pdf',bytes:new Uint8Array([1])},
    {fileName:'test.js',mimeType:'application/javascript',bytes:new Uint8Array([1])}
  ];
  for(const item of bad)await assert.rejects(uploadDocumentToDrive(env,item,fail));
  assert.equal(called,0);
});

test('Invalid upstream response is not trusted',async()=>{
  await assert.rejects(callLegacyDriveBridge(env,'ping',{},mockTransport(()=>{},true)),/rejected/);
  await assert.rejects(callLegacyDriveBridge(env,'arbitraryDestroy',{}),/Disallowed/);
});

test('Mismatched remote file checksums are rejected',async()=>{
  const bad=async()=>Response.json({success:true,data:{fileId:'safe-test-file',sizeBytes:6,sha256:'x'.repeat(64)}});
  await assert.rejects(uploadDocumentToDrive(env,{
    submissionId:'TEST-1',submissionNo:'TEST-001',rootFolderId:'STAGING_FOLDER_12345',
    documentType:'RESEARCH_EVIDENCE',version:1,fileName:'Evidence.pdf',
    mimeType:'application/pdf',bytes:new Uint8Array([0,1,2,3,4,255])
  },bad),/mismatched/);
});
