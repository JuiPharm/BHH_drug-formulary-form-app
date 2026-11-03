import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const auth=fs.readFileSync(path.join(root,'backend/apps-script/AuthService.gs'),'utf8');
const config=fs.readFileSync(path.join(root,'backend/apps-script/Config.gs'),'utf8');
const ui=fs.readFileSync(path.join(root,'admin/js/app.js'),'utf8');
function harness(){
  const context={
    appError_:(code,message)=>Object.assign(new Error(message),{code}),
    Date,Number,String,Boolean,Object,Array
  };
  vm.createContext(context);
  vm.runInContext(auth,context);
  context.getAdminAuthMode_=()=> 'PASSWORD';
  context.requirePasswordSessionAdmin_=()=>({
    email:'pharmacy@bhh.test',role:'PHARMACIST',authType:'PASSWORD',mustChangePassword:true
  });
  return context;
}
test('reset accounts cannot read submissions with a temporary password',()=>{
  const c=harness();
  assert.throws(()=>c.requireAdmin_({action:'listSubmissions',auth:{sessionToken:'synthetic'}}),
    e=>e.code==='PASSWORD_CHANGE_REQUIRED');
});
test('reset accounts may only access the change-password/profile/logout recovery flow',()=>{
  const c=harness();
  for(const action of ['getAdminProfile','changeAdminPassword','adminLogout']){
    const session=c.requireAdmin_({action,auth:{sessionToken:'synthetic'}});
    assert.equal(session.mustChangePassword,true);
  }
});
test('first-login password policy is wired end-to-end in V2 source',()=>{
  assert.match(config,/'MustChangePassword'/);
  assert.match(auth,/MustChangePassword: true/);
  assert.match(auth,/MustChangePassword: false/);
  assert.match(auth,/mustChangePassword: toBoolean_\(admin\.MustChangePassword\)/);
  assert.match(ui,/if \(result\.admin\.mustChangePassword\)/);
  assert.match(ui,/if \(profile\.mustChangePassword\)/);
  assert.match(ui,/function closePasswordModal\(\) \{\s*if \(state\.profile\?\.mustChangePassword\)/);
});
