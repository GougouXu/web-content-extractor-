document.addEventListener('DOMContentLoaded', () => {
  // DOM元素
  const sourceContent = document.getElementById('sourceContent');
  const splitContent = document.getElementById('splitContent');
  const sourceCharCount = document.getElementById('sourceCharCount');
  const splitCharCount = document.getElementById('splitCharCount');
  const settingsPanel = document.getElementById('settingsPanel');
  const overlay = document.getElementById('overlay');
  const blockList = document.getElementById('blockList');
  const splitMode = document.getElementById('splitMode');
  const customSeparatorLabel = document.getElementById('customSeparatorLabel');
  const fixedLengthLabel = document.getElementById('fixedLengthLabel');
  const customSeparator = document.getElementById('customSeparator');
  const fixedLength = document.getElementById('fixedLength');
  const addNumbering = document.getElementById('addNumbering');
  
  let blockedWords = [];
  
  // 从存储中加载屏蔽词
  chrome.storage.sync.get(['blockedWords'], (result) => {
    if (result.blockedWords) {
      blockedWords = result.blockedWords;
      blockList.value = blockedWords.join('\n');
    }
  });
  
  // 更新字数统计
  function updateCharCount(textarea, countElement) {
    const text = textarea.value;
    const count = text.replace(/\s/g, '').length;
    countElement.textContent = `字数：${count}`;
  }
  
  // 应用屏蔽词过滤
  function applyBlockedWords(text) {
    let result = text;
    for (const word of blockedWords) {
      if (word.trim()) {
        const regex = new RegExp(word.trim(), 'g');
        result = result.replace(regex, '');
      }
    }
    return result;
  }
  
  // 拆分文本
  function splitText() {
    const text = sourceContent.value;
    let parts = [];
    
    switch (splitMode.value) {
      case 'paragraph':
        // 按段落拆分（多个换行符）
        parts = text.split(/\n\s*\n/).filter(part => part.trim());
        break;
      case 'custom':
        // 使用自定义分隔符
        const separator = customSeparator.value
          .replace(/\\n/g, '\n')  // 处理换行符
          .replace(/\\t/g, '\t'); // 处理制表符
        parts = text.split(separator).filter(part => part.trim());
        break;
      case 'fixedLength':
        // 按固定字数拆分
        const length = parseInt(fixedLength.value);
        let remaining = text;
        while (remaining.length > 0) {
          // 找到最近的标点或空格作为分割点
          let end = Math.min(length, remaining.length);
          if (end < remaining.length) {
            const punctuation = remaining.slice(0, end + 10).search(/[。！？.!?]\s*/);
            if (punctuation !== -1 && punctuation <= end + 10) {
              end = punctuation + 1;
            }
          }
          parts.push(remaining.slice(0, end).trim());
          remaining = remaining.slice(end).trim();
        }
        break;
    }
    
    // 添加段落编号
    if (addNumbering.checked) {
      parts = parts.map((part, index) => `【${index + 1}】${part}`);
    }
    
    // 用两个换行符连接段落
    splitContent.value = parts.join('\n\n');
    updateCharCount(splitContent, splitCharCount);
  }
  
  // 监听拆分模式变化
  splitMode.addEventListener('change', () => {
    customSeparatorLabel.style.display = splitMode.value === 'custom' ? 'block' : 'none';
    fixedLengthLabel.style.display = splitMode.value === 'fixedLength' ? 'block' : 'none';
  });
  
  // 监听文本变化
  sourceContent.addEventListener('input', () => updateCharCount(sourceContent, sourceCharCount));
  splitContent.addEventListener('input', () => updateCharCount(splitContent, splitCharCount));
  
  // 设置按钮
  document.getElementById('settingsButton').addEventListener('click', () => {
    settingsPanel.classList.add('show');
    overlay.classList.add('show');
  });
  
  // 取消设置
  document.getElementById('cancelSettings').addEventListener('click', () => {
    settingsPanel.classList.remove('show');
    overlay.classList.remove('show');
  });
  
  // 保存设置
  document.getElementById('saveSettings').addEventListener('click', () => {
    blockedWords = blockList.value.split('\n').filter(word => word.trim());
    chrome.storage.sync.set({ blockedWords }, () => {
      settingsPanel.classList.remove('show');
      overlay.classList.remove('show');
    });
  });
  
  // 提取内容按钮
  document.getElementById('extractButton').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        function extractText(element) {
          if (!element) return '';
          
          // 创建一个副本以防止修改原始DOM
          const clone = element.cloneNode(true);
          
          // 移除脚本和样式
          const scripts = clone.getElementsByTagName('script');
          const styles = clone.getElementsByTagName('style');
          for (let i = scripts.length - 1; i >= 0; i--) scripts[i].remove();
          for (let i = styles.length - 1; i >= 0; i--) styles[i].remove();
          
          // 使用TextEncoder和TextDecoder来保留所有字符
          function preserveAllChars(text) {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder('utf-8', { fatal: true });
            return decoder.decode(encoder.encode(text));
          }
          
          // 获取所有文本节点
          function getAllTextNodes(node, result = []) {
            if (node.nodeType === 3) { // 文本节点
              if (node.textContent.trim()) {
                result.push(node);
              }
            } else if (node.nodeType === 1 && // 元素节点
                      !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) {
              const style = window.getComputedStyle(node);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                for (let child of node.childNodes) {
                  getAllTextNodes(child, result);
                }
                // 在块级元素后添加换行节点
                if (['DIV', 'P', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
                  result.push(document.createTextNode('\n'));
                }
              }
            }
            return result;
          }
          
          // 获取所有文本节点
          const textNodes = getAllTextNodes(clone);
          
          // 组合所有文本
          let content = '';
          for (const node of textNodes) {
            content += preserveAllChars(node.textContent);
          }
          
          // 最小程度的清理
          return content
            .replace(/\s*@[^@\n]*(?:\n|$)/g, '\n')  // 移除广告文本
            .replace(/\n{3,}/g, '\n\n')            // 最多保留两个换行
            .trim();
        }
        
        // 获取页面内容
        const mainContent = document.querySelector('#oneboolt') || 
                          document.querySelector('.noveltext') ||
                          document.querySelector('article') ||
                          document.querySelector('main') ||
                          document.body;
        
        return extractText(mainContent);
      }
    }, (results) => {
      if (results && results[0]) {
        // 应用屏蔽词过滤
        sourceContent.value = applyBlockedWords(results[0].result);
        updateCharCount(sourceContent, sourceCharCount);
      }
    });
  });
  
  // 拆分按钮
  document.getElementById('splitButton').addEventListener('click', splitText);
  
  // 复制内容按钮
  document.getElementById('copyButton').addEventListener('click', () => {
    splitContent.select();
    document.execCommand('copy');
  });
  
  // 保存到文件按钮
  document.getElementById('saveButton').addEventListener('click', () => {
    const parts = splitContent.value.split(/\n\s*\n/).filter(part => part.trim());
    if (parts.length === 0) return;
    
    // 创建ZIP文件
    const zip = new JSZip();
    parts.forEach((part, index) => {
      const filename = `part_${String(index + 1).padStart(3, '0')}.txt`;
      zip.file(filename, part);
    });
    
    // 生成并下载ZIP文件
    zip.generateAsync({ type: 'blob' }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'content.zip';
      a.click();
      URL.revokeObjectURL(url);
    });
  });
  
  // 清空按钮
  document.getElementById('clearSourceButton').addEventListener('click', () => {
    sourceContent.value = '';
    updateCharCount(sourceContent, sourceCharCount);
  });
  
  document.getElementById('clearSplitButton').addEventListener('click', () => {
    splitContent.value = '';
    updateCharCount(splitContent, splitCharCount);
  });
});
