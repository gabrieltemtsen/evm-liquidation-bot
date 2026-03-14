/* ─── EVM Liquidation Bot Dashboard ─────────────────────────────────────────
   Vanilla JS + Socket.io + Chart.js — no build step required.
   ────────────────────────────────────────────────────────────────────────── */

const socket = io();

// ─── Chart setup ────────────────────────────────────────────────────────────

const chartCtx = document.getElementById('profitChart').getContext('2d');
const profitChart = new Chart(chartCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Cumulative Profit (ETH)',
      data: [],
      borderColor: '#22d3a0',
      backgroundColor: 'rgba(34, 211, 160, 0.08)',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: '#22d3a0',
      fill: true,
      tension: 0.4,
    }],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1f2e',
        borderColor: '#2a3045',
        borderWidth: 1,
        titleColor: '#8b94b3',
        bodyColor: '#e4e8f0',
        callbacks: {
          label: ctx => ` ${ctx.parsed.y.toFixed(6)} ETH`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(42,48,69,0.5)' },
        ticks: { color: '#8b94b3', font: { size: 10 }, maxTicksLimit: 8 },
      },
      y: {
        grid: { color: 'rgba(42,48,69,0.5)' },
        ticks: {
          color: '#8b94b3',
          font: { size: 10 },
          callback: v => v.toFixed(4) + ' ETH',
        },
      },
    },
  },
});

// ─── State ───────────────────────────────────────────────────────────────────

let state = {
  botStatus: 'connecting',
  totalSuccess: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortAddr(addr) {
  if (!addr) return '–';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function formatTime(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function formatHF(hf) {
  const n = parseFloat(hf);
  return n.toFixed(4);
}

function hfClass(hf) {
  const n = parseFloat(hf);
  if (n < 1.0) return 'hf-liquidatable';
  if (n < 1.05) return 'hf-critical';
  if (n < 1.15) return 'hf-warning';
  return 'hf-safe';
}

function hfLabel(hf) {
  const n = parseFloat(hf);
  if (n < 1.0) return '🔴 ' + formatHF(hf);
  if (n < 1.05) return '🟡 ' + formatHF(hf);
  if (n < 1.15) return '🔵 ' + formatHF(hf);
  return '🟢 ' + formatHF(hf);
}

function etherscanTxUrl(hash, chain) {
  if (!hash) return null;
  const explorers = {
    'Ethereum Mainnet': 'https://etherscan.io/tx/',
    'Arbitrum One': 'https://arbiscan.io/tx/',
    'Base': 'https://basescan.org/tx/',
  };
  const base = explorers[chain] || 'https://etherscan.io/tx/';
  return base + hash;
}

function formatDebtBase(raw) {
  // Aave base units = 8 decimals (USD)
  if (!raw) return '$0.00';
  const n = Number(BigInt(raw)) / 1e8;
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Render functions ─────────────────────────────────────────────────────────

function updateStats(liquidatorStats, monitorStats) {
  // Total profit
  const profit = parseFloat(liquidatorStats.totalProfit || '0');
  document.getElementById('total-profit').textContent = profit.toFixed(6);

  // Liquidations today
  document.getElementById('liq-today').textContent = liquidatorStats.liquidationsToday || 0;

  // Positions
  document.getElementById('pos-count').textContent = monitorStats.totalAddressesTracked || 0;
  document.getElementById('liq-count').textContent = monitorStats.liquidatableCount || 0;

  // Success rate
  document.getElementById('success-rate').textContent = (liquidatorStats.successRate || 0) + '%';
  document.getElementById('total-attempts').textContent = liquidatorStats.totalAttempts || 0;

  // Block number
  if (monitorStats.blockNumber) {
    document.getElementById('block-num').textContent =
      monitorStats.blockNumber.toLocaleString();
  }

  // Profit today badge
  const profitToday = parseFloat(liquidatorStats.profitToday || '0');
  document.getElementById('profit-today').textContent =
    '+' + profitToday.toFixed(6) + ' ETH today';

  // Liq badge
  document.getElementById('liq-badge').textContent =
    (liquidatorStats.totalSuccess || 0) + ' total';
}

function updateStatusBadge(status) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = 'status-dot';

  switch (status) {
    case 'running':
      text.textContent = 'RUNNING';
      dot.classList.add(); // default green pulse
      break;
    case 'stopped':
      dot.classList.add('stopped');
      text.textContent = 'STOPPED';
      break;
    case 'error':
      dot.classList.add('error');
      text.textContent = 'ERROR';
      break;
    default:
      text.textContent = status.toUpperCase();
  }
}

function renderLiquidations(liquidations) {
  const tbody = document.getElementById('liq-table-body');

  if (!liquidations || liquidations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No liquidations yet</td></tr>';
    return;
  }

  tbody.innerHTML = liquidations.map(liq => {
    const profit = parseFloat(liq.profit || '0');
    const profitColor = profit > 0 ? 'green' : 'red';
    const icon = liq.success ? '✅' : '❌';
    const txUrl = etherscanTxUrl(liq.txHash, document.getElementById('chain-name').textContent);
    const txLink = liq.txHash
      ? `<a class="tx-link" href="${txUrl}" target="_blank">${liq.txHash.slice(0, 10)}…</a>`
      : liq.dryRun ? '<span style="color:var(--accent-yellow);font-size:11px">DRY RUN</span>' : '–';

    return `<tr>
      <td style="color:var(--text-secondary)">${formatTime(liq.timestamp)}</td>
      <td class="address">${shortAddr(liq.borrower)}</td>
      <td style="font-size:11px">${liq.debtAsset ? shortAddr(liq.debtAsset) : '–'}</td>
      <td class="${profitColor}">${icon} ${profit.toFixed(6)} ETH</td>
      <td>${txLink}</td>
    </tr>`;
  }).join('');
}

function renderPositions(positions) {
  const tbody = document.getElementById('positions-table-body');
  const badge = document.getElementById('positions-badge');

  badge.textContent = (positions?.length || 0) + ' near liquidation';

  if (!positions || positions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No at-risk positions detected</td></tr>';
    return;
  }

  tbody.innerHTML = positions.map(pos => {
    const hf = pos.healthFactor || '0';
    const cls = hfClass(hf);
    const pair = pos.bestPair
      ? `<span style="color:var(--accent-red)">${pos.bestPair.debtSymbol}</span> / <span style="color:var(--accent-green)">${pos.bestPair.collateralSymbol}</span>`
      : '–';
    const debtToCover = pos.bestPair
      ? (Number(BigInt(pos.bestPair.debtToCover)) / 1e18).toFixed(4) + ' tokens'
      : '–';

    const totalDebt = formatDebtBase(pos.totalDebtBase);
    const totalColl = formatDebtBase(pos.totalCollateralBase);

    return `<tr>
      <td class="address">${shortAddr(pos.borrower)}</td>
      <td><span class="hf-badge ${cls}">${hfLabel(hf)}</span></td>
      <td style="font-size:12px">${totalDebt} / ${totalColl}</td>
      <td style="font-size:12px">${pair}</td>
      <td>${debtToCover}</td>
    </tr>`;
  }).join('');
}

function updateProfitChart(profitHistory) {
  if (!profitHistory || profitHistory.length === 0) return;

  // Compute cumulative
  let cumulative = 0;
  const labels = [];
  const data = [];

  profitHistory.forEach(entry => {
    cumulative += entry.profit || 0;
    labels.push(new Date(entry.time).toLocaleTimeString(undefined, { hour12: false }));
    data.push(parseFloat(cumulative.toFixed(8)));
  });

  profitChart.data.labels = labels;
  profitChart.data.datasets[0].data = data;
  profitChart.update('none'); // no animation for perf
}

// ─── Hydrate full state ───────────────────────────────────────────────────────

function hydrateState(data) {
  document.getElementById('chain-name').textContent = data.chain || '–';

  if (data.dryRun) {
    document.getElementById('dry-run-badge').style.display = 'inline';
  }

  updateStatusBadge(data.botStatus || 'stopped');
  updateStats(data.liquidatorStats || {}, data.monitorStats || {});
  renderLiquidations(data.recentLiquidations || []);
  renderPositions(data.positions || []);
  updateProfitChart(data.profitHistory || []);
}

// ─── Socket.io event handlers ─────────────────────────────────────────────────

socket.on('connect', () => {
  console.log('Connected to bot');
  updateStatusBadge('running');
  socket.emit('request_state');
});

socket.on('disconnect', () => {
  updateStatusBadge('stopped');
});

socket.on('initial_state', (data) => {
  hydrateState(data);
});

socket.on('stats_update', (data) => {
  if (data.liquidatorStats && data.monitorStats) {
    updateStats(data.liquidatorStats, data.monitorStats);
  } else if (data.liquidatorStats) {
    updateStats(data.liquidatorStats, {});
  }
});

socket.on('position_update', (data) => {
  if (data.monitorStats) {
    document.getElementById('pos-count').textContent =
      data.monitorStats.totalAddressesTracked || 0;
    document.getElementById('liq-count').textContent =
      data.monitorStats.liquidatableCount || 0;
    document.getElementById('block-num').textContent =
      (data.monitorStats.blockNumber || 0).toLocaleString();
  }
  if (data.positions) {
    renderPositions(data.positions);
  }
});

socket.on('liquidation_executed', (liq) => {
  // Flash notification
  const tbody = document.getElementById('liq-table-body');
  const profit = parseFloat(liq.profit || '0');
  const profitColor = profit > 0 ? 'green' : 'red';
  const icon = liq.success ? '✅' : '❌';
  const txUrl = etherscanTxUrl(liq.txHash, document.getElementById('chain-name').textContent);
  const txLink = liq.txHash
    ? `<a class="tx-link" href="${txUrl}" target="_blank">${liq.txHash.slice(0, 10)}…</a>`
    : liq.dryRun ? '<span style="color:var(--accent-yellow);font-size:11px">DRY RUN</span>' : '–';

  const row = document.createElement('tr');
  row.className = 'flash-green';
  row.innerHTML = `
    <td style="color:var(--text-secondary)">${formatTime(liq.timestamp)}</td>
    <td class="address">${shortAddr(liq.borrower)}</td>
    <td style="font-size:11px">${liq.debtAsset ? shortAddr(liq.debtAsset) : '–'}</td>
    <td class="${profitColor}">${icon} ${profit.toFixed(6)} ETH</td>
    <td>${txLink}</td>
  `;

  // Remove "no liquidations" placeholder
  const empty = tbody.querySelector('td[colspan]');
  if (empty) tbody.innerHTML = '';

  tbody.insertBefore(row, tbody.firstChild);

  // Keep max 50 rows in the DOM
  while (tbody.children.length > 50) {
    tbody.removeChild(tbody.lastChild);
  }

  // Update total profit
  const totalProfitEl = document.getElementById('total-profit');
  const current = parseFloat(totalProfitEl.textContent) + profit;
  totalProfitEl.textContent = current.toFixed(6);

  state.totalSuccess++;
  document.getElementById('liq-badge').textContent = state.totalSuccess + ' total';
});

socket.on('profit_update', (data) => {
  if (data.totalProfit !== undefined) {
    document.getElementById('total-profit').textContent =
      parseFloat(data.totalProfit).toFixed(6);
  }
  if (data.profitHistory) {
    updateProfitChart(data.profitHistory);
  }
});

socket.on('status_update', (data) => {
  if (data.status) updateStatusBadge(data.status);
});

// ─── Periodic block counter update ──────────────────────────────────────────
// The server pushes position_update events which include blockNumber.
// This is just a visual heartbeat to show the connection is alive.

setInterval(() => {
  if (!socket.connected) {
    updateStatusBadge('stopped');
  }
}, 5000);

console.log('⚡ EVM Liquidation Bot Dashboard loaded');
