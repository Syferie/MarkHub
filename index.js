// 重定向到Next.js应用
export default function Index() {
  if (typeof window !== 'undefined') {
    window.location.href = '/app';
  }
  return null;
}
