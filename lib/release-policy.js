const fs=require('node:fs'),path=require('node:path');
function releasePolicy(appRoot){
 const file=path.join(appRoot,'release-policy.json');
 if(!fs.existsSync(file))return {managedEditing:true};
 const policy=JSON.parse(fs.readFileSync(file,'utf8'));
 if(typeof policy.managedEditing!=='boolean')throw Error('Invalid release policy');
 return policy;
}
function requireManagedEditing(policy){if(!policy.managedEditing)throw Error(policy.reason||'Managed text editing is unavailable in this release.');}
module.exports={releasePolicy,requireManagedEditing};
