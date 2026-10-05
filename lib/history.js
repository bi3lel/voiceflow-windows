function checkedEntry(entries,id) {
 const entry=entries.find(e=>String(e.id)===String(id));if(!entry)throw Error('History entry no longer exists');return entry;
}
function updateEntry(entries,id,patch) {
 const entry=checkedEntry(entries,id);
 if(typeof patch?.cleaned!=='string'||!patch.cleaned.trim()||patch.cleaned.length>200000)throw Error('Invalid edited text');
 return entries.map(e=>e===entry?{...e,cleaned:patch.cleaned.trim(),edited:true}:e);
}
function exportHistory(entries,format) {
 if(format==='json')return JSON.stringify(entries,null,2)+'\n';
 return entries.map(e=>`${e.ts} | ${e.format||e.mode||'plain'}\n${e.cleaned||e.raw}\n\nOriginal:\n${e.raw}`).join('\n\n--------------------\n\n')+'\n';
}
module.exports={checkedEntry,updateEntry,exportHistory};
