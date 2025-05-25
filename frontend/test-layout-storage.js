// 简单测试脚本来验证 localStorage 布局偏好功能
const { saveBookmarkLayout, getBookmarkLayout, removeBookmarkLayout } = require('./lib/config-storage.ts');

console.log('测试布局偏好存储功能...');

// 测试保存和读取
console.log('1. 测试保存 card 布局');
saveBookmarkLayout('card');

console.log('2. 测试读取布局偏好');
const layout = getBookmarkLayout();
console.log('读取到的布局:', layout);

console.log('3. 测试默认值');
removeBookmarkLayout();
const defaultLayout = getBookmarkLayout('list');
console.log('默认布局:', defaultLayout);

console.log('测试完成！');