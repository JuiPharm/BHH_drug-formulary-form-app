import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const code = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../backend/apps-script/V2MigrationService.gs'),'utf8');
const SOURCE_ID='SYNTHETIC_SOURCE_SHEET_1234567890';
class Sheet {
  constructor(name, values){ this.name=name; this.values=values; }
  getLastRow(){return this.values.length;}
  getLastColumn(){return this.values[0]?.length||1;}
  getDataRange(){return {getValues:()=>this.values.map(r=>[...r])};}
  getRange(row,col,numRows,numCols){
    return {clearContent:()=>{
      for(let r=row-1;r<row-1+numRows;r++)
        for(let c=col-1;c<col-1+numCols;c++) this.values[r][c]='';
    }};
  }
}
function harness(){
  const all=[
    'Submissions','Companies','Representatives','ProductDetails',
    'PhysicianProposals','PhysicianApprovers','Documents','ResearchEvidence',
    'GeneratedDocuments','StatusHistory','EmailLog','DuplicateAttempts',
    'OrganizationSignatories','SystemSettings','PublicTemplates','AuditLog','Counters'
  ];
  const related=new Set([
    'ProductDetails','PhysicianProposals','PhysicianApprovers','Documents',
    'ResearchEvidence','GeneratedDocuments','StatusHistory','EmailLog'
  ]);
  const tabs=Object.fromEntries(all.map(name=>[
    name, new Sheet(name,name==='Submissions'
      ? [['SubmissionID'],['S1']] : related.has(name)
      ? [['SubmissionID'],['S1']] : [['ID']])
  ]));
  tabs.AdminSessions=new Sheet('AdminSessions',[['SessionID','TokenHash'],['old-session','sensitive-hash']]);
  tabs.AdminUsers=new Sheet('AdminUsers',[
    ['Email','Role','PasswordHash','PasswordSalt','PasswordAlgorithm','PasswordChangedAt','FailedLoginCount','LockedUntil','LastLoginAt'],
    ['owner@bhh.test','SYSTEM_ADMIN','hash','salt','algorithm','date',5,'locked','date']
  ]);
  const props={BHH_V2_SOURCE_SPREADSHEET_ID:SOURCE_ID};
  const spreadsheet={getId:()=>SOURCE_ID,getSheetByName:name=>tabs[name]||null};
  const scope={
    APP:{LOCK_TIMEOUT_MS:30000,DATABASE_FILE_NAME:'Drug Formulary Submission Database',
      MAIN_FOLDER_NAME:'Drug Formulary Submissions',TEMPLATE_FOLDER_NAME:'Templates',TIMEZONE:'Asia/Bangkok'},
    String,Object,Array,Date,Number,Math,Boolean,
    SpreadsheetApp:{openById:id=>id===SOURCE_ID?spreadsheet:null},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>props[k]||null,
      setProperties:o=>Object.assign(props,o)
    })},
    PROP_KEYS:{SPREADSHEET_ID:'DB_ID',MAIN_FOLDER_ID:'DRIVE_MAIN',
      TEMPLATE_FOLDER_ID:'TEMPLATES',SETUP_AT:'SETUP'},
    appError_:(code,message)=>Object.assign(new Error(message),{code}),
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}
  };
  vm.createContext(scope);
  vm.runInContext(code,scope);
  return {scope,tabs,props};
}
test('V2 migration preview preserves original data and counts references',()=>{
  const {scope,tabs}=harness();
  const out=scope.previewV2Migration_();
  assert.equal(out.readiness,'DRY_RUN_ONLY');
  assert.equal(out.source.submissionCount,1);
  assert.equal(out.source.counts.Documents,1);
  assert.equal(out.source.orphanCounts.EmailLog,0);
  assert.equal(tabs.AdminUsers.values[1][2],'hash'); // preview is read-only
});
test('V2 migration preview rejects orphaned document records',()=>{
  const {scope,tabs}=harness();
  tabs.Documents.values[1][0]='UNKNOWN';
  assert.throws(()=>scope.previewV2Migration_(),e=>e.code==='V2_ORPHANED_RELATION');
});
test('V2 migration does not run without explicit cutover gate',()=>{
  const {scope}=harness();
  assert.throws(()=>scope.runV2Migration_(),e=>e.code==='V2_CUTOVER_NOT_APPROVED');
});
test('V2 migration refuses to overwrite an existing configured database',()=>{
  const {scope,props}=harness();
  props.BHH_V2_CUTOVER_APPROVED='YES';
  props.DB_ID='AN_EXISTING_V2_DB';
  assert.throws(()=>scope.runV2Migration_(),e=>e.code==='V2_TARGET_ALREADY_CONFIGURED');
});
test('V2 copy scrubs user password verifiers and all sessions while retaining usernames',()=>{
  const {scope,tabs}=harness();
  const result=scope.scrubV2Authentication_({getSheetByName:n=>tabs[n]});
  assert.equal(result.sessionsPurged,true);
  assert.equal(tabs.AdminSessions.values[1][0],'');
  assert.equal(tabs.AdminSessions.values[1][1],'');
  assert.equal(tabs.AdminUsers.values[1][0],'owner@bhh.test');
  assert.equal(tabs.AdminUsers.values[1][1],'SYSTEM_ADMIN');
  assert.equal(tabs.AdminUsers.values[1][2],'');
  assert.equal(tabs.AdminUsers.values[1][3],'');
  assert.equal(tabs.AdminUsers.values[1][7],'');
});
