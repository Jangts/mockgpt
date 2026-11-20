/**
 * Playground 的模拟运行时：用场景配置创建唯一的 MockGPT 实例，并包装成页面
 * 可直接替换全局 fetch 的请求适配器。
 */
import { MockGPT } from '@jangts/mock-gpt';
import { playgroundConfig } from './scenarios/playground-config.ts';
import { createPlaygroundFetch } from './simulated-fetch.ts';

/** 每个页面拥有自己的规则、计数器与带种子的随机状态。 */
export const mock = new MockGPT(playgroundConfig());
/** 页面统一使用的 fetch 实现；请求命中模拟规则，不访问真实模型服务。 */
export const playgroundFetch = createPlaygroundFetch(mock);
