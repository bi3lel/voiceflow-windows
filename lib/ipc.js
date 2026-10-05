const events = Object.freeze(['state','history-update','last-text','error-msg','open-history','diagnostics','model-download']);
const invokes = Object.freeze(['get-config','save-config','get-history','clear-history','delete-history-item','copy-text','copy-last','diagnostics','unload-model','warm-model','cancel','list-devices','test-microphone','update-history-item','reformat-history-item','export-history']);
const modelInvokes=['get-models','download-model','cancel-model-download','use-model','get-editing-model','download-editing-model','enable-editing-model','get-hardware'];
const sends = Object.freeze(['open-settings','close-settings','hide-pill','open-history-window','shortcut-capture']);
module.exports = { events, invokes:Object.freeze([...invokes,...modelInvokes]), sends };
