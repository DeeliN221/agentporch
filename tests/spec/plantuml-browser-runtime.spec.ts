/**
 * 文件目的：验证真实浏览器引擎的取消、主题和网络隔离行为。
 * 不替换引擎或模拟渲染响应，直接检查生成的 SVG 和隔离页面清理。
 */
import { test, expect } from '@playwright/test';

test('cancelled diagrams release their frame and do not affect later dark-mode renders', async ({ page }) => {
  /** 模拟快速编辑导致取消旧源码，再确认新图表独立渲染并释放所有上下文。 */
  await page.goto('/');
  const result = await page.evaluate(async () => {
    /** 经开发服务器导入生产使用的渲染入口，验证真实异步生命周期。 */
    const moduleUrl = '/frontend/utils/plantumlRenderer.ts';
    const { renderPlantUml } = await import(moduleUrl);
    const controller = new AbortController();
    const cancelled = renderPlantUml('@startuml\nAlice -> Bob: stale\n@enduml', { signal: controller.signal })
      .then(() => 'unexpected success', (error: Error) => error.name);
    controller.abort();
    const source = '@startuml\nAlice -> Bob: current\n@enduml';
    const [light, dark] = await Promise.all([
      renderPlantUml(source, { signal: new AbortController().signal }),
      renderPlantUml(source, { signal: new AbortController().signal, dark: true }),
    ]);
    return { cancelled: await cancelled, light, dark, frames: document.querySelectorAll('iframe[title="PlantUML renderer"]').length };
  });
  expect(result.cancelled).toBe('AbortError');
  expect(result.light).toContain('current');
  expect(result.dark).toContain('current');
  expect(result.dark).not.toEqual(result.light);
  expect(result.frames).toBe(0);
});

test('remote includes cannot send requests outside the bundled renderer', async ({ page }) => {
  /** 即使源码显式包含外部地址，也不能越过渲染沙箱发起网络请求。 */
  const remoteRequests: string[] = [];
  await page.route('https://example.invalid/**', async (route) => {
    remoteRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto('/');
  const error = await page.evaluate(async () => {
    /** 捕获实际引擎错误，确保回退流程结束而非无限等待。 */
    const moduleUrl = '/frontend/utils/plantumlRenderer.ts';
    const { renderPlantUml } = await import(moduleUrl);
    try {
      await renderPlantUml('@startuml\n!include https://example.invalid/private.puml\nAlice -> Bob\n@enduml', {
        signal: new AbortController().signal,
      });
      return 'unexpected success';
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(error).toBe('Unable to render PlantUML diagram.');
  expect(remoteRequests).toEqual([]);
});
