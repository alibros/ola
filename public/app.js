const modelSelect = document.getElementById('model-select');
const chatArea = document.getElementById('chat-area');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');

let currentModel = '';
let messages = [];

// --- Metrics State ---
const metrics = JSON.parse(localStorage.getItem('ola_metrics') || '{}');

function saveMetrics() {
  localStorage.setItem('ola_metrics', JSON.stringify(metrics));
}

function resetMetrics() {
  Object.keys(metrics).forEach(k => delete metrics[k]);
  saveMetrics();
  updateCurrentMetrics();
  updateMetricsTable();
}

function updateCurrentMetrics() {
  const model = currentModel;
  const m = metrics[model] || {};
  const el = document.getElementById('current-metrics');
  if (!el) return;
  el.innerHTML =
    `<b>${model}</b> | Size: ${m.size || '-'} | Avg Latency: ${m.avgLatency ? m.avgLatency.toFixed(2)+'s' : '-'} | Tokens/sec: ${m.tokensPerSec ? m.tokensPerSec.toFixed(1) : '-'} | Rating: ${m.rating ? m.rating.toFixed(2) : '-'} ⭐`;
  saveMetrics();
}

function updateMetricsTable() {
  const tbody = document.querySelector('#metrics-table tbody');
  tbody.innerHTML = '';
  Object.entries(metrics).forEach(([model, m]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${model}</td>
      <td>${m.size || '-'}</td>
      <td>${m.avgLatency ? m.avgLatency.toFixed(2)+'s' : '-'}</td>
      <td>${m.tokensPerSec ? m.tokensPerSec.toFixed(1) : '-'}</td>
      <td>${m.rating ? m.rating.toFixed(2) : '-'} ⭐</td>
    `;
    tbody.appendChild(tr);
  });
  saveMetrics();
}

// --- Modal Logic ---
const showMetricsBtn = document.getElementById('show-metrics');
const metricsModal = document.getElementById('metrics-modal');
const closeMetricsBtn = document.getElementById('close-metrics');
const resetMetricsBtn = document.getElementById('reset-metrics');
if (showMetricsBtn && metricsModal && closeMetricsBtn) {
  showMetricsBtn.onclick = () => {
    updateMetricsTable();
    metricsModal.style.display = 'block';
  };
  closeMetricsBtn.onclick = () => {
    metricsModal.style.display = 'none';
  };
  window.onclick = (e) => {
    if (e.target === metricsModal) metricsModal.style.display = 'none';
  };
  if (resetMetricsBtn) {
    resetMetricsBtn.onclick = () => {
      if (confirm('Reset all metrics?')) resetMetrics();
    };
  }
}

// --- User Rating ---
function addRatingButtons(msgDiv, model) {
  const ratingDiv = document.createElement('div');
  ratingDiv.style.marginTop = '0.3rem';
  ratingDiv.style.textAlign = 'right';
  ratingDiv.innerHTML = `
    <button class="rate-btn" data-rate="1" title="Good">👍</button>
    <button class="rate-btn" data-rate="-1" title="Bad">👎</button>
  `;
  msgDiv.appendChild(ratingDiv);
  ratingDiv.querySelectorAll('.rate-btn').forEach(btn => {
    btn.onclick = () => {
      if (!metrics[model]) metrics[model] = {};
      if (!metrics[model].votes) metrics[model].votes = [];
      metrics[model].votes.push(btn.dataset.rate === '1' ? 1 : 0);
      const arr = metrics[model].votes;
      metrics[model].rating = arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
      updateCurrentMetrics();
      updateMetricsTable();
      ratingDiv.innerHTML = `<span style='color:#2563eb;font-weight:500;'>Thank you!</span>`;
    };
  });
}

// --- Patch addMessage to support metrics ---
const origAddMessage = addMessage;
addMessage = function(role, content, opts={}) {
  origAddMessage(role, content);
  if (role === 'model' && opts && opts.model) {
    const lastMsg = chatArea.lastChild;
    addRatingButtons(lastMsg, opts.model);
  }
};

async function fetchModels() {
  const res = await fetch('/api/models');
  const models = await res.json();
  modelSelect.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
    modelSelect.appendChild(opt);
  });
  if (models.length) {
    currentModel = models[0].name;
  }
}

modelSelect.addEventListener('change', e => {
  currentModel = e.target.value;
  messages = [];
  chatArea.innerHTML = '';
});

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, function(tag) {
    const chars = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    };
    return chars[tag] || tag;
  });
}

function formatModelContent(content) {
  // Simple formatting: code blocks, bold, italics, line breaks
  let html = content
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>');
  return html;
}

function addMessage(role, content) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  if (role === 'model') {
    msgDiv.innerHTML = formatModelContent(content);
  } else {
    msgDiv.textContent = escapeHTML(content);
  }
  chatArea.appendChild(msgDiv);
  // Always scroll to bottom after DOM update
  setTimeout(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  }, 0);
}

// --- Patch chat logic to measure latency/tokens ---
chatForm.addEventListener('submit', async e => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text || !currentModel) return;
  addMessage('user', text);
  messages.push({ role: 'user', content: text });
  userInput.value = '';
  addMessage('model', '...');
  const t0 = performance.now();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: currentModel, messages })
    });
    const t1 = performance.now();
    const data = await res.json();
    chatArea.removeChild(chatArea.lastChild); // remove '...'
    if (data.message && data.message.content) {
      // Token count: split by whitespace (approx)
      const tokenCount = data.message.content.split(/\s+/).length;
      const latency = (t1-t0)/1000;
      if (!metrics[currentModel]) metrics[currentModel] = {};
      // Rolling average for latency/tokens/sec
      if (!metrics[currentModel].latencies) metrics[currentModel].latencies = [];
      if (!metrics[currentModel].tokens) metrics[currentModel].tokens = [];
      metrics[currentModel].latencies.push(latency);
      metrics[currentModel].tokens.push(tokenCount/latency);
      if (metrics[currentModel].latencies.length > 10) metrics[currentModel].latencies.shift();
      if (metrics[currentModel].tokens.length > 10) metrics[currentModel].tokens.shift();
      metrics[currentModel].avgLatency = metrics[currentModel].latencies.reduce((a,b)=>a+b,0)/metrics[currentModel].latencies.length;
      metrics[currentModel].tokensPerSec = metrics[currentModel].tokens.reduce((a,b)=>a+b,0)/metrics[currentModel].tokens.length;
      addMessage('model', data.message.content, {model: currentModel});
      messages.push({ role: 'assistant', content: data.message.content });
      updateCurrentMetrics();
      updateMetricsTable();
    } else if (data.error) {
      addMessage('model', '[Error: ' + data.error + ']');
    }
  } catch (err) {
    chatArea.removeChild(chatArea.lastChild);
    addMessage('model', '[Network error]');
  }
});

// --- Fetch model sizes on load ---
async function fetchModelSizes() {
  const res = await fetch('/api/models');
  const models = await res.json();
  models.forEach(m => {
    if (!metrics[m.name]) metrics[m.name] = {};
    metrics[m.name].size = m.size ? (m.size/1e9).toFixed(2) + ' GB' : '-';
  });
  updateCurrentMetrics();
  updateMetricsTable();
  saveMetrics();
}
window.addEventListener('DOMContentLoaded', () => {
  fetchModels();
  fetchModelSizes();
  updateCurrentMetrics();
}); 