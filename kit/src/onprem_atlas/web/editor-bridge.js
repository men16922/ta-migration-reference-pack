/* Local integration for draw.io 32.4.1. The cached upstream build is unchanged.
 * Document capture follows diagram-bot's editor-bridge.js pattern. */
App.initPluginCallback();
Draw.loadPlugin(function (ui) {
  Editor.defaultCompressed = false;
  // Ready-to-use, vendor-neutral symbols avoid coloured clip-art in company drawings.
  const sidebar = ui.sidebar;
  const common = 'html=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#262626;fontColor=#262626;gradientColor=none;shadow=0;';
  const shapes = [
    ['보안장비', 'shape=mxgraph.cisco.security.lock;', 70, 80],
    ['방화벽', 'shape=mxgraph.networks.firewall;', 80, 70],
    ['스위치', 'shape=mxgraph.networks.switch;', 90, 55],
    ['로드밸런서', 'shape=mxgraph.networks.load_balancer;', 90, 65],
    ['WEB', 'shape=mxgraph.cisco.computers_and_peripherals.web_browser;', 90, 70],
    ['WAS', 'shape=mxgraph.cisco.servers.software_based_server;', 70, 80],
    ['서버', 'shape=mxgraph.networks.server;', 70, 80],
    ['DB', 'shape=cylinder3;boundedLbl=1;backgroundOutline=1;', 70, 80],
    ['스토리지', 'shape=mxgraph.cisco.storage.fibre_channel_disk_subsystem;', 100, 70],
    ['외부망', 'shape=cloud;', 140, 80],
    ['망 구획', 'rounded=0;container=1;collapsible=0;verticalAlign=top;align=left;spacingTop=8;spacingLeft=10;dashed=1;', 320, 220],
  ];
  sidebar.addPaletteFunctions('atlas-onprem', '온프레미스 · 흑백', true, [
    ...shapes.map(([label, style, w, h]) => sidebar.createVertexTemplateEntry(
      common + style + (label === '망 구획' ? '' : 'verticalLabelPosition=bottom;verticalAlign=top;'), w, h, label, label)),
    sidebar.createEdgeTemplateEntry(common + 'edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=block;endFill=0;', 100, 0, 'TCP / PORT', '통신 연결'),
  ]);
  const first = sidebar.palettes.general?.[0];
  if (first) sidebar.palettes['atlas-onprem'].forEach(element => first.parentNode.insertBefore(element, first));
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin || event.source !== parent) return;
    let message;
    try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
    catch { return; }
    if (message?.action === 'atlasFit') {
      ui.fitDiagramOrPages();
      return;
    }
    if (message?.action !== 'atlasDocument') return;
    try {
      ui.editor.graph.stopEditing(false);
      const xml = ui.getFileData(true, false, false, null, true, false, null, false, null, true);
      parent.postMessage(JSON.stringify({event: 'atlasDocument', xml}), location.origin);
    } catch (error) {
      parent.postMessage(JSON.stringify({event: 'atlasError', error: String(error.message || error)}), location.origin);
    }
  });
});
