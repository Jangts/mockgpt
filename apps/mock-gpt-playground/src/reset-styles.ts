/**
 * 把 Playground 自带的 reset.css 转成 Lit 可注入的样式对象，
 * 使各影子 DOM 组件共享同一份浏览器控件基线。
 */
import { unsafeCSS } from 'lit';
import reset from './reset.css?inline';

/** 已编译的全局 reset 样式，供组件的 static styles 复用。 */
export const resetStyles = unsafeCSS(reset);
