const {test}=require('node:test'),assert=require('node:assert/strict');
const pkg=require('../package.json'),policy=require('../release-policy.json'),defaults=require('../portable-defaults.json');
test('one public installer excludes speech weights and private data, preserves app data and creates a stable shortcut',()=>{
 assert.equal(pkg.build.nsis.oneClick,true);assert.equal(pkg.build.nsis.createDesktopShortcut,'always');
 assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);
 assert.equal(pkg.build.nsis.shortcutName,'VoiceFlow');
 assert(!pkg.build.extraResources.some(r=>/models|data|ffmpeg|ollama|llama/.test(r.from)));
 assert.equal(policy.managedEditing,false);assert.equal(defaults.historyEnabled,true);assert.equal(defaults.useOllama,false);
});
