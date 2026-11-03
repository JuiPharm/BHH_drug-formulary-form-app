import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend/apps-script/SuperAdminService.gs'),
  'utf8'
);
function harness() {
  const users = [
    { Email:'owner@bhh.test',DisplayName:'Owner',Role:'SUPER_ADMIN',IsActive:true,PasswordHash:'hash',PasswordSalt:'salt' },
    { Email:'pharmacist@bhh.test',DisplayName:'Pharmacist',Role:'PHARMACIST',IsActive:true,PasswordHash:'hash',PasswordSalt:'salt' },
    { Email:'inactive@bhh.test',DisplayName:'Disabled',Role:'PHARMACIST',IsActive:false,PasswordHash:'hash',PasswordSalt:'salt' }
  ];
  const events=[], revoked=[];
  let login='owner@bhh.test';
  const scope={
    APP:{LOCK_TIMEOUT_MS:1000},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Session:{getEffectiveUser:()=>({getEmail:()=>login})},
    normalizeAdminEmail_: email=>String(email||'').trim().toLowerCase(),
    isValidEmail_: email=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
    appError_:(code,message)=>Object.assign(new Error(message),{code}),
    requireAdmin_:()=>({email:login,role:'UNTRUSTED_SNAPSHOT'}),
    findAdminUserByEmail_: email=>users.find(u=>u.Email===String(email).toLowerCase())||null,
    getSheet_:()=>({name:'AdminUsers'}),
    getSheetObjects_:()=>users.map((u,i)=>({...u,__rowNumber:i+2})),
    findObjects_: (_sheet,predicate)=>users.map((u,i)=>({...u,__rowNumber:i+2})).filter(predicate),
    updateRowByNumber_:(_sheet,num,changes)=>Object.assign(users[num-2],changes),
    generateRandomAdminPassword_:()=> 'Synthetic-strong-password-123!',
    createAdminUser_:(email,displayName,role,password)=>{
      assert(password.length>8);
      users.push({Email:email,DisplayName:displayName,Role:role,IsActive:true,PasswordHash:'hash',PasswordSalt:'salt'});
      return {email,displayName,role,isActive:true,passwordConfigured:true};
    },
    setAdminPassword_:(email,password)=>{
      assert(password.length>8);
      revoked.push(email);
    },
    revokeAllAdminSessions_: email=>{revoked.push(email);return 1;},
    unlockAdminUser_: email=>({email,success:true}),
    auditLog_:(actor,action,type,email,requestId,detail)=>events.push({actor,action,email,detail}),
    toBoolean_: v=>v===true||String(v).toLowerCase()==='true',
    toDateValue_: v=>v?new Date(v).getTime():0,
    Date,Number,Boolean,Object,Array,String,Math
  };
  vm.createContext(scope);
  vm.runInContext(source,scope);
  return {scope,users,events,revoked,setLogin:email=>{login=email;}};
}

test('non-super-admin cannot list, create, reset, or disable accounts',()=>{
  const {scope,setLogin}=harness();
  setLogin('pharmacist@bhh.test');
  for(const action of [
    ()=>scope.listManagedAdminUsers_({}),
    ()=>scope.createManagedAdminUser_({}, {email:'new@bhh.test',displayName:'New'},'req'),
    ()=>scope.resetManagedAdminPassword_({}, {email:'owner@bhh.test'},'req'),
    ()=>scope.disableManagedAdminUser_({}, {email:'owner@bhh.test'},'req')
  ]) assert.throws(action,e=>e.code==='SUPER_ADMIN_REQUIRED');
});

test('Super Admin user list never returns password hashes/salts',()=>{
  const {scope}=harness();
  const records=scope.listManagedAdminUsers_({}).items;
  assert.equal(records.length,3);
  assert.equal(JSON.stringify(records).includes('PasswordHash'),false);
  assert.equal(JSON.stringify(records).includes('PasswordSalt'),false);
});

test('Super Admin creates a user with a one-time password and rejects duplicates',()=>{
  const {scope,events}=harness();
  const data=scope.createManagedAdminUser_({},{
    email:'new@bhh.test',displayName:'New Pharmacist',role:'PHARMACIST'
  },'req');
  assert.equal(data.user.role,'PHARMACIST');
  assert.match(data.temporaryPassword,/Synthetic/);
  assert(events.some(x=>x.action==='superAdminCreateUser'));
  assert.equal(JSON.stringify(events).includes(data.temporaryPassword),false);
  assert.throws(()=>scope.createManagedAdminUser_({},{
    email:'new@bhh.test',displayName:'New',role:'PHARMACIST'
  },'req'),e=>e.code==='ADMIN_ALREADY_EXISTS');
});

test('Super Admin cannot delete or demote own account or final active Super Admin',()=>{
  const {scope,users,setLogin}=harness();
  assert.throws(()=>scope.disableManagedAdminUser_({}, {email:'owner@bhh.test'},'req'),
    e=>e.code==='CANNOT_REMOVE_OWN_SUPER_ADMIN');
  users.push({
    Email:'secondary@bhh.test',DisplayName:'Second',Role:'SUPER_ADMIN',
    IsActive:true,PasswordHash:'hash',PasswordSalt:'salt'
  });
  setLogin('secondary@bhh.test');
  scope.disableManagedAdminUser_({}, {email:'owner@bhh.test'},'req');
  assert.equal(users[0].IsActive,false);
  assert.throws(()=>scope.updateManagedAdminUser_({},{
    email:'secondary@bhh.test',role:'SYSTEM_ADMIN'
  },'req'),e=>e.code==='CANNOT_REMOVE_OWN_SUPER_ADMIN');
});

test('Disabling a pharmacist revokes login sessions and retains audit history',()=>{
  const {scope,users,revoked,events}=harness();
  const response=scope.disableManagedAdminUser_({}, {email:'pharmacist@bhh.test'},'req');
  assert.equal(users[1].IsActive,false);
  assert.equal(response.user.isActive,false);
  assert(revoked.includes('pharmacist@bhh.test'));
  assert(events.some(e=>e.action==='superAdminUpdateUser'));
});

test('Password reset revokes sessions and never puts plaintext in audit logs',()=>{
  const {scope,revoked,events}=harness();
  const result=scope.resetManagedAdminPassword_({}, {email:'pharmacist@bhh.test'},'req');
  assert.match(result.temporaryPassword,/Synthetic/);
  assert.equal(result.requiresRelogin,true);
  assert(revoked.includes('pharmacist@bhh.test'));
  assert.equal(JSON.stringify(events).includes(result.temporaryPassword),false);
});

test('Bootstrap only for Apps Script editor effective user and never auto repeats',()=>{
  const {scope,users}=harness();
  assert.throws(()=>scope.bootstrapOwnerSuperAdmin_(),e=>e.code==='SUPER_ADMIN_ALREADY_EXISTS');
  users[0].Role='SYSTEM_ADMIN';
  const result=scope.bootstrapOwnerSuperAdmin_();
  assert.equal(result.role,'SUPER_ADMIN');
  assert.equal(users[0].Role,'SUPER_ADMIN');
});
