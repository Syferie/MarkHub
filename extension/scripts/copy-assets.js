const fs = require('fs');
const path = require('path');

// 确保目标目录存在
if (!fs.existsSync('dist/icons')) {
  fs.mkdirSync('dist/icons', { recursive: true });
}

// 复制 manifest.json
fs.copyFileSync('manifest.json', 'dist/manifest.json');

// 复制图标文件
fs.copyFileSync('icons/icon16.png', 'dist/icons/icon16.png');
fs.copyFileSync('icons/icon48.png', 'dist/icons/icon48.png');
fs.copyFileSync('icons/icon128.png', 'dist/icons/icon128.png');

// 修复 popup/index.html 中的路径问题
const popupHtmlPath = 'dist/popup/index.html';
if (fs.existsSync(popupHtmlPath)) {
  let htmlContent = fs.readFileSync(popupHtmlPath, 'utf8');
  
  // 将绝对路径替换为相对路径
  htmlContent = htmlContent.replace(/src="\/([^"]+)"/g, 'src="../$1"');
  htmlContent = htmlContent.replace(/href="\/([^"]+)"/g, 'href="../$1"');
  
  fs.writeFileSync(popupHtmlPath, htmlContent);
  console.log('Fixed popup HTML paths');
}

console.log('Assets copied successfully!');