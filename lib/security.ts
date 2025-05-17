/**
 * 安全工具函数
 *
 * 提供响应完整性验证和加密功能
 */

import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * 生成响应签名
 *
 * @param data 需要签名的数据
 * @param secret 密钥
 * @returns 签名字符串
 */
export function generateSignature(data: any, secret: string): string {
  // 将数据转换为字符串
  const dataString = typeof data === 'string' ? data : JSON.stringify(data);

  // 使用HMAC-SHA256算法生成签名
  return createHmac('sha256', secret)
    .update(dataString)
    .digest('hex');
}

/**
 * 验证响应签名
 *
 * @param data 需要验证的数据
 * @param signature 签名
 * @param secret 密钥
 * @returns 签名是否有效
 */
export function verifySignature(data: any, signature: string, secret: string): boolean {
  const expectedSignature = generateSignature(data, secret);
  return expectedSignature === signature;
}

/**
 * 计算数据的哈希值
 *
 * @param data 需要计算哈希的数据
 * @returns 哈希值
 */
export function calculateHash(data: any): string {
  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256')
    .update(dataString)
    .digest('hex');
}

/**
 * 验证数据的哈希值
 *
 * @param data 需要验证的数据
 * @param hash 哈希值
 * @returns 哈希值是否匹配
 */
export function verifyHash(data: any, hash: string): boolean {
  const calculatedHash = calculateHash(data);
  return calculatedHash === hash;
}

/**
 * 检测响应是否包含可疑内容
 *
 * 注意：此函数已被简化，不再进行具体内容检测
 * 实际生产环境中应使用更复杂的内容检测算法或服务
 *
 * @param tags 标签数组
 * @returns 始终返回false，表示没有检测到可疑内容
 */
export function containsSuspiciousContent(_tags: string[]): boolean {
  // 简化实现，不再进行具体内容检测
  return false;
}

/**
 * 验证URL是否匹配
 *
 * @param requestUrl 请求URL
 * @param responseUrl 响应URL
 * @returns 是否匹配
 */
export function verifyUrlMatch(requestUrl: string, responseUrl?: string): boolean {
  if (!responseUrl) return true; // 如果响应没有URL，则认为匹配
  return requestUrl === responseUrl;
}

/**
 * 加密数据
 *
 * @param data 需要加密的数据
 * @param key 加密密钥 (必须是32字节长度)
 * @returns 加密后的数据 (格式: iv:加密数据)
 */
export function encryptData(data: any, key: string): string {
  // 确保密钥长度为32字节
  const normalizedKey = createHash('sha256').update(key).digest();

  // 生成随机初始化向量
  const iv = randomBytes(16);

  // 创建加密器
  const cipher = createCipheriv('aes-256-cbc', normalizedKey, iv);

  // 将数据转换为字符串
  const dataString = typeof data === 'string' ? data : JSON.stringify(data);

  // 加密数据
  let encrypted = cipher.update(dataString, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // 返回格式: iv:加密数据
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * 解密数据
 *
 * @param encryptedData 加密的数据 (格式: iv:加密数据)
 * @param key 解密密钥 (必须是32字节长度)
 * @returns 解密后的数据
 */
export function decryptData(encryptedData: string, key: string): any {
  // 确保密钥长度为32字节
  const normalizedKey = createHash('sha256').update(key).digest();

  // 分离初始化向量和加密数据
  const [ivHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');

  // 创建解密器
  const decipher = createDecipheriv('aes-256-cbc', normalizedKey, iv);

  // 解密数据
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  // 尝试解析JSON
  try {
    return JSON.parse(decrypted);
  } catch (e) {
    // 如果不是JSON，则返回原始字符串
    return decrypted;
  }
}
