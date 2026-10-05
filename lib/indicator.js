// The overlay never expands into a notification panel or takes keyboard focus.
const indicatorSize = Object.freeze({width:420,height:56});
function indicatorPresentation(detail) {
  if (['loading','recording'].includes(detail.state)) return {visible:true};
  if (detail.state === 'error') return {visible:true,hideAfterMs:1800};
  return {visible:false};
}
module.exports = {indicatorSize,indicatorPresentation};
