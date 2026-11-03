import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source=fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend/apps-script/EmailService.gs'),
  'utf8'
);
function setup({mailFails=false, logFails=false}={}){
  const mail=[],logs=[],errors=[];
  const scope={
    APP:{NAME:'BHH Drug Formulary'},
    Utilities:{getUuid:()=> 'SYNTHETIC_EMAIL_LOG_ID'},
    getSheet_:()=>({name:'EmailLog'}),
    MailApp:{sendEmail:input=>{
      if(mailFails)throw new Error('Synthetic MailApp failure');
      mail.push(input);
    }},
    appendObject_:(_sheet,record)=>{
      if(logFails)throw new Error('Synthetic Sheet logging error');
      logs.push(record);
    },
    console:{error:line=>errors.push(String(line))},
    Date,String
  };
  vm.createContext(scope);
  vm.runInContext(source,scope);
  return {scope,mail,logs,errors};
}
test('submit mail keeps company/admin recipient, subject and logging',()=>{
  const {scope,mail,logs}=setup();
  const answer=scope.sendAndLogEmail_('DF-TEST','ReceiptConfirmation',
    'representative@example.test','Received BHH submission','Synthetic body');
  assert.equal(answer.success,true);
  assert.equal(mail.length,1);
  assert.equal(mail[0].to,'representative@example.test');
  assert.equal(mail[0].subject,'Received BHH submission');
  assert.equal(logs.length,1);
  assert.equal(logs[0].Status,'SUCCESS');
});
test('MailApp failure records FAILED but does not delete/roll back submitted data',()=>{
  const {scope,logs,errors}=setup({mailFails:true});
  const result=scope.sendAndLogEmail_('DF-TEST','NewSubmissionAlert',
    'pharmacist@example.test','Synthetic subject','Synthetic body');
  assert.equal(result.status,'FAILED');
  assert.equal(logs.length,1);
  assert.equal(logs[0].Status,'FAILED');
  assert(errors.some(x=>x.includes('send failed')));
});
test('EmailLog failure after a successful MailApp send is not treated as send failure',()=>{
  const {scope,mail,errors}=setup({logFails:true});
  const result=scope.sendAndLogEmail_('DF-TEST','ReceiptConfirmation',
    'rep@example.test','Synthetic','Synthetic');
  assert.equal(mail.length,1);
  assert.equal(result.status,'SUCCESS');
  assert(errors.some(x=>x.includes('EmailLog write failed')));
});
test('MailApp and EmailLog both fail without throwing from submit workflow',()=>{
  const {scope,errors}=setup({mailFails:true,logFails:true});
  const outcome=scope.sendAndLogEmail_('DF-TEST','ReceiptConfirmation',
    'rep@example.test','Synthetic','Synthetic');
  assert.equal(outcome.status,'FAILED');
  assert.equal(errors.length,2);
});
