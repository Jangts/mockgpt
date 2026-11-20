/**
 * 浏览器入口：先加载 Web Awesome 组件与全局 reset/样式，再注册页面组件，
 * 保证自定义元素在渲染前已经定义。仅由 index.html 引入。
 */
import '@awesome.me/webawesome/dist/styles/webawesome.css';
import './reset.css';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import '@awesome.me/webawesome/dist/components/drawer/drawer.js';
import '@awesome.me/webawesome/dist/components/copy-button/copy-button.js';
// 组件按依赖顺序注册：清单与配置先于消息列表和应用外壳。
import './components/prompt-catalog.ts';
import './components/scenario-config.ts';
import './components/chat-messages.ts';
import './playground-app.ts';
import './style.css';
