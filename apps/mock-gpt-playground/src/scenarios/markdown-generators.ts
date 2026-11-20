/**
 * Markdown 生成器示例：把图片地址与已有订单数据渲染成 Markdown 文本，
 * 用于演示结构化 JSON 之外的输出形态。两者共享同一随机上下文，可重放。
 */
import { generators, type GenerationContext } from '@jangts/mock-gpt';
import { orders } from './composed-generators.ts';

// 候选尺寸固定，保证 reset 后同一 seed 得到相同图片。
const imageSize = generators.pick([
  { width: 640, height: 360 },
  { width: 720, height: 480 },
  { width: 640, height: 480 },
  { width: 800, height: 450 },
  { width: 600, height: 400 },
  { width: 768, height: 432 },
  { width: 640, height: 400 },
  { width: 720, height: 405 },
]);

/**
 * 生成内嵌 SVG 图片的 Markdown 文本。
 * @param context 本次生成的随机上下文。
 * @returns 带图片说明与 data URL 的 Markdown 字符串。
 */
export function imageMarkdown(context: GenerationContext) {
  const imageUrl = generators.imageUrl(imageSize(context));
  return `这是一张由本地规则生成的模拟图片：\n\n![MockGPT 模拟图片](${imageUrl(context)})`;
}

/**
 * 把订单数据渲染为 GFM 表格。
 * @param context 本次生成的随机上下文，同时决定订单内容。
 * @returns 含表头与金额小计的 Markdown 表格。
 */
export function tableMarkdown(context: GenerationContext) {
  const rows = orders(context).orders;
  return [
    '下面是生成的模拟订单表格，金额单位为人民币元：',
    '',
    '| 商品 | 数量 | 单价 | 小计 | 状态 |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map(
      (row) =>
        `| ${row.item} | ${row.quantity} | ${row.unitPrice.toFixed(2)} | ${row.total.toFixed(2)} | ${row.status} |`,
    ),
  ].join('\n');
}
