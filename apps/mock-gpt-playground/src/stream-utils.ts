/**
 * 页面与模拟传输共用的小工具：可取消的延时和 JSON 文本序列化。
 */
/**
 * 等待指定毫秒，并在取消时立即失败。
 * @param ms 延时毫秒数；为 0 时直接返回。
 * @param signal 取消信号，中止时以该信号原因拒绝。
 * @returns 计时结束或被取消后的 Promise。
 * @throws 信号已中止时同步抛出；等待中取消则拒绝并携带 signal.reason。
 */
export async function delay(ms: number, signal: AbortSignal): Promise<void> {
  // 已中止的信号立即失败，避免继续排定时器。
  signal.throwIfAborted();
  if (!ms) return;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      // 清理监听器，防止取消后仍持有闭包。
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}
/** 把任意值序列化为 JSON 文本，供响应内容或诊断字段使用。 */
export const jsonText = (value: unknown): string => JSON.stringify(value);
