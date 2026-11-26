/**
 * API 参考页的 Markdown 渲染器：把从 SDK 声明提取的记录组织成目录、定义、
 * 字段表、成员签名与使用示例。只负责排版与转义，不解析源码或判断类型语义。
 */
import { slug } from './paths.mjs';

export const fence = (code, language = 'ts') => `\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n`;
const inline = (value) =>
  '`' + String(value).replaceAll('`', '\\`').replaceAll('|', '\\|').replace(/\r?\n/g, ' ') + '`';
const cell = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
const frontmatter = (title) => `---\ntitle: ${JSON.stringify(title)}\noutline: [2, 3]\n---\n\n`;

function fieldTable(fields, notes, locale) {
  const t = locale.text.render;
  if (!fields?.length) return '';
  return (
    '\n| ' + [t.tableField, t.tableType, t.tableRequired, t.tableDescription].join(' | ') + ' |\n' +
    '| --- | --- | --- | --- |\n' +
    fields
      .map(
        (field) =>
          `| ${inline(field.name)} | ${inline(field.type)} | ${field.optional ? t.optional : t.required} | ${field.readonly ? t.readonly : ''}${cell(notes?.[field.name] ?? field.description) || t.tableDescription + '见类型定义。'} |`,
      )
      .join('\n') +
    '\n'
  );
}

function genericTable(parameters, locale) {
  const t = locale.text.render;
  if (!parameters?.length) return '';
  return (
    '\n| 类型参数 | 约束 | 默认类型 |\n| --- | --- | --- |\n' +
    parameters
      .map(
        (parameter) =>
          `| ${inline(parameter.name)} | ${parameter.constraint ? inline(parameter.constraint) : '—'} | ${parameter.default ? inline(parameter.default) : '—'} |`,
      )
      .join('\n') +
    '\n'
  );
}

function callSection(signature, name, locale) {
  const t = locale.text.render;
  const signatureText = signature.construct
    ? signature.text.replace(/^new\s*/, `new ${name}`)
    : `${name}${signature.text}`;
  let result = `\n${fence(signatureText)}\n`;
  if (signature.description) result += signature.description + '\n';
  if (signature.parameters.length)
    result +=
      '\n| ' + [t.tableField, t.tableType, 'Passing', t.tableDescription].join(' | ') + ' |\n' +
      '| --- | --- | --- | --- |\n' +
      signature.parameters
        .map(
          (parameter) =>
            `| ${inline(parameter.name)} | ${inline(parameter.type)} | ${parameter.rest ? t.rest : parameter.optional ? t.optional : t.required} | ${cell(parameter.description) || '—'} |`,
        )
        .join('\n') +
      '\n';
  else result += '\n' + t.noParameters + '\n';
  result += `\n${t.returns} ${inline(signature.returns)}\n`;
  return result;
}

function definitionSummary(record, locale) {
  const t = locale.text.render;
  const head =
    record.name +
    (record.typeParameters?.length
      ? `<${record.typeParameters.map((parameter) => parameter.name).join(', ')}>`
      : '');
  if (record.kind === 'class' || record.kind === 'interface') {
    let result = fence(
      `${record.kind} ${head}${record.bases?.length ? ` extends ${record.bases.join(', ')}` : ''}`,
    );
    if (record.typeParameters?.length)
      result += '\n### Type parameters\n' + genericTable(record.typeParameters, locale);
    return result;
  }
  if (record.kind === 'type') {
    if (record.fields.length)
      return `\n**Type alias:** ${inline(head)}${record.typeParameters?.length ? '\n' + genericTable(record.typeParameters, locale) : ''}\n`;
    return (
      fence(`type ${head} = ${record.typeExpression};`) +
      (record.typeParameters?.length
        ? '\n### Type parameters\n' + genericTable(record.typeParameters, locale)
        : '')
    );
  }
  if (record.kind === 'constant' && !record.members.length)
    return fence(`const ${head}: ${record.valueType}`);
  if (record.kind === 'constant') return `\n**Namespace:** ${inline(head)}\n`;
  return '';
}

function memberSection(record, notes, locale) {
  const t = locale.text.render;
  const table =
    '\n## ' + t.members + '\n\n| ' + [t.tableMember, t.tablePurpose].join(' | ') + ' |\n' +
    '| --- | --- |\n' +
    record.members
      .map(
        (member) =>
          `| [${inline(member.name)}](#member-${slug(member.name)}) | ${cell(notes?.[member.name] ?? member.description) || 'See full signature below.'} |`,
      )
      .join('\n') +
    '\n';
  const details = record.members
    .map((member) => {
      const callName =
        record.kind === 'class' && !member.static ? member.name : `${record.name}.${member.name}`;
      let section =
        `\n### ${member.name} {#member-${slug(member.name)}}\n\n` +
        (record.kind === 'class' ? `${member.static ? 'Static member' : 'Instance method'}.\n\n` : '') +
        (member.description ? `${member.description}\n` : '');
      for (const signature of member.signatures) section += callSection(signature, callName, locale);
      return section;
    })
    .join('\n');
  return table + details;
}

export function renderSymbol(record, notes, locale) {
  const t = locale.text.render;
  const heading = `## ${record.name} {#api-${slug(record.name)}}`;
  const modules = [...new Set(record.imports.map((item) => item.module))];
  let result =
    `\n${heading}\n\n` +
    (record.description ? `${record.description}\n\n` : '') +
    `${t.import} ${modules.map(inline).join(locale.text.render.joiner ?? '、')}。\n` +
    `\n${t.definition}\n${definitionSummary(record, locale)}`;
  if (record.signatures.length) {
    record.signatures.forEach((signature, index) => {
      const title = signature.construct
        ? t.constructor
        : record.signatures.length === 1
          ? t.call
          : t.overload(index);
      result += `\n### ${title}\n` + callSection(signature, record.name, locale);
    });
  }
  if (record.fields.length) result += '\n## Fields\n' + fieldTable(record.fields, notes, locale);
  if (record.members.length) result += memberSection(record, notes, locale);
  return result;
}

export function renderPage(page, examples = '', locale) {
  const t = locale.text.render;
  const overview =
    `\n## Contents\n\n| ${[t.tableSymbol, t.tableKind, t.tableDescription].join(' | ')} |\n` +
    '| --- | --- | --- |\n' +
    page.symbols
      .map(
        (symbol) =>
          `| [${inline(symbol.name)}](#api-${slug(symbol.name)}) | ${t.kindLabel(symbol.record.kind)} | ${cell(symbol.summary)} |`,
      )
      .join('\n') +
    '\n';
  const body = page.symbols.map((symbol) => renderSymbol(symbol.record, page.notes, locale)).join('\n');
  const exampleSection = examples?.trim() ? `\n## ${t.examples}\n${examples.trim()}\n` : '';
  return (
    frontmatter(page.title) +
    `# ${page.title}\n\n${page.lead}\n${overview}\n${body}${exampleSection}`
  );
}
