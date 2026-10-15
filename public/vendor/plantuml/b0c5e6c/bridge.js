/**
 * 文件目的：连接应用与隔离的 PlantUML 浏览器引擎，不访问网络或应用存储。
 * 上游引擎使用全局状态，因此每个隔离页面只处理一次渲染。
 */
let started = false;
const bundledLibraries = new Set(['themes.js', 'openiconic.js', 'emoji.js', 'c4.min.js']);

function deliverSvg(svg) {
  /** 上游会把语法错误作为 SVG 返回；识别其诊断头，使应用仍能显示源码回退。 */
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const labels = Array.from(document.querySelectorAll('text'), (node) => node.textContent || '');
  const isDiagnostic = labels[0]?.startsWith('PlantUML version ')
    && labels.some((label) => /^\[From .*\(line \d+\)/.test(label));
  if (document.querySelector('parsererror') || isDiagnostic) {
    window.parent.postMessage({ type: 'plantuml-error' }, '*');
  } else {
    window.parent.postMessage({ type: 'plantuml-result', svg }, '*');
  }
}

window.PLANTUML_STDLIB_LOADER = (name, ready, failed) => {
  /** 仅加载明确随应用发布的标准库，禁止源码指定其他脚本路径。 */
  if (!bundledLibraries.has(name)) {
    failed('This PlantUML library is not bundled.');
    return true;
  }
  const script = document.createElement('script');
  script.src = name;
  script.onload = ready;
  script.onerror = () => failed('Unable to load the bundled PlantUML library.');
  document.head.appendChild(script);
  return true;
};

window.addEventListener('message', (event) => {
  /** 源码通过消息传递而非拼接 HTML，返回 SVG 后由父页面回收整个上下文。 */
  if (event.source !== window.parent || event.data?.type !== 'plantuml-render' || started) return;
  started = true;
  const fail = () => window.parent.postMessage({ type: 'plantuml-error' }, '*');
  try {
    if (typeof event.data.source !== 'string') return fail();
    PlantUML.renderToString(
      event.data.source.split(/\r\n|\r|\n/),
      deliverSvg,
      fail,
      { dark: event.data.dark === true, maxSvgSize: 4 * 1024 * 1024 },
    );
  } catch {
    fail();
  }
});

window.parent.postMessage({ type: 'plantuml-ready' }, '*');
