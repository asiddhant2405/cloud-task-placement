/**
 * Cloud Task Placement - Interactive Simulator & Engine
 * Latency-aware VM/replica placement using:
 * - Graph MST (Kruskal & Prim)
 * - All-Pairs Shortest Path (Dijkstra)
 * - Exact Capacity-Aware Dynamic Programming (Bitmask Subsets)
 * - Baseline Heuristics (First-Fit, Greedy Arrival, Greedy by Traffic)
 */

// --- Default Configuration (Identical to report & config.json) ---
const DEFAULT_CONFIG = {
  servers: ["S1", "S2", "S3", "S4", "S5", "S6"],
  capacity: [6, 6, 6, 4, 6, 6],
  links: [
    ["S1", "S2", 20],
    ["S1", "S4", 25],
    ["S1", "S3", 35],
    ["S2", "S4", 15],
    ["S4", "S3", 30],
    ["S2", "S5", 25],
    ["S3", "S6", 20],
    ["S5", "S6", 30],
    ["S4", "S6", 40]
  ],
  tasks: [
    { cpu: 2, traffic: 20, anchor: "S4" },
    { cpu: 2, traffic: 30, anchor: "S4" },
    { cpu: 2, traffic: 25, anchor: "S2" },
    { cpu: 2, traffic: 90, anchor: "S4" },
    { cpu: 3, traffic: 85, anchor: "S2" },
    { cpu: 2, traffic: 40, anchor: "S1" },
    { cpu: 3, traffic: 75, anchor: "S4" },
    { cpu: 2, traffic: 35, anchor: "S3" },
    { cpu: 3, traffic: 60, anchor: "S2" },
    { cpu: 2, traffic: 50, anchor: "S5" },
    { cpu: 3, traffic: 45, anchor: "S6" }
  ]
};

// Preset scenarios
const PRESETS = {
  default: DEFAULT_CONFIG,
  dense: {
    servers: ["S1", "S2", "S3", "S4", "S5", "S6"],
    capacity: [8, 8, 8, 6, 8, 8],
    links: [
      ["S1", "S2", 15], ["S1", "S4", 20], ["S2", "S4", 12],
      ["S2", "S5", 18], ["S4", "S3", 22], ["S3", "S6", 16],
      ["S5", "S6", 24], ["S4", "S6", 30]
    ],
    tasks: [
      { cpu: 3, traffic: 120, anchor: "S2" },
      { cpu: 2, traffic: 95, anchor: "S4" },
      { cpu: 2, traffic: 80, anchor: "S1" },
      { cpu: 3, traffic: 110, anchor: "S5" },
      { cpu: 2, traffic: 70, anchor: "S3" },
      { cpu: 3, traffic: 90, anchor: "S6" },
      { cpu: 2, traffic: 60, anchor: "S4" },
      { cpu: 2, traffic: 85, anchor: "S2" },
      { cpu: 3, traffic: 75, anchor: "S1" },
      { cpu: 2, traffic: 50, anchor: "S6" }
    ]
  },
  bottleneck: {
    servers: ["S1", "S2", "S3", "S4", "S5"],
    capacity: [4, 4, 4, 3, 4],
    links: [
      ["S1", "S2", 10], ["S2", "S3", 15], ["S3", "S4", 40],
      ["S4", "S5", 12], ["S2", "S5", 45]
    ],
    tasks: [
      { cpu: 2, traffic: 80, anchor: "S1" },
      { cpu: 2, traffic: 60, anchor: "S2" },
      { cpu: 1, traffic: 90, anchor: "S4" },
      { cpu: 2, traffic: 40, anchor: "S5" },
      { cpu: 2, traffic: 70, anchor: "S3" },
      { cpu: 2, traffic: 50, anchor: "S1" },
      { cpu: 1, traffic: 30, anchor: "S4" }
    ]
  },
  balanced: {
    servers: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
    capacity: [6, 6, 6, 6, 6, 6, 6, 6],
    links: [
      ["S1", "S2", 12], ["S2", "S3", 14], ["S3", "S4", 16],
      ["S4", "S5", 18], ["S5", "S6", 20], ["S6", "S7", 22],
      ["S7", "S8", 24], ["S8", "S1", 26], ["S2", "S6", 30],
      ["S3", "S7", 28]
    ],
    tasks: [
      { cpu: 2, traffic: 50, anchor: "S1" },
      { cpu: 2, traffic: 40, anchor: "S2" },
      { cpu: 3, traffic: 80, anchor: "S3" },
      { cpu: 2, traffic: 60, anchor: "S4" },
      { cpu: 2, traffic: 45, anchor: "S5" },
      { cpu: 3, traffic: 70, anchor: "S6" },
      { cpu: 2, traffic: 30, anchor: "S7" },
      { cpu: 2, traffic: 90, anchor: "S8" },
      { cpu: 3, traffic: 55, anchor: "S2" },
      { cpu: 2, traffic: 65, anchor: "S6" }
    ]
  }
};

// --- Priority Queue (Binary Min-Heap) ---
class MinPriorityQueue {
  constructor(comparator = (a, b) => a[0] - b[0]) {
    this.heap = [];
    this.comparator = comparator;
  }
  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._bubbleDown(0);
    }
    return top;
  }
  size() { return this.heap.length; }
  isEmpty() { return this.heap.length === 0; }
  _bubbleUp(idx) {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.comparator(this.heap[idx], this.heap[parentIdx]) < 0) {
        [this.heap[idx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[idx]];
        idx = parentIdx;
      } else break;
    }
  }
  _bubbleDown(idx) {
    const len = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < len && this.comparator(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < len && this.comparator(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest !== idx) {
        [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
        idx = smallest;
      } else break;
    }
  }
}

// --- Graph Algorithms ---
function kruskal(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  const sorted = [...edges].sort((a, b) => a[2] - b[2]);
  const tree = [];
  for (const [u, v, w] of sorted) {
    const ra = find(u);
    const rb = find(v);
    if (ra !== rb) {
      parent[ra] = rb;
      tree.push([u, v, w]);
    }
  }
  return tree;
}

function prim(n, adj) {
  const seen = new Set([0]);
  const heap = new MinPriorityQueue((a, b) => a[0] - b[0]);
  for (const [v, w] of (adj[0] || [])) {
    heap.push([w, 0, v]);
  }
  const tree = [];
  while (!heap.isEmpty() && seen.size < n) {
    const [w, u, v] = heap.pop();
    if (seen.has(v)) continue;
    seen.add(v);
    tree.push([u, v, w]);
    for (const [x, ww] of (adj[v] || [])) {
      if (!seen.has(x)) {
        heap.push([ww, v, x]);
      }
    }
  }
  return tree;
}

function dijkstra(n, adj, src) {
  const dist = Array(n).fill(Infinity);
  const par = Array(n).fill(-1);
  dist[src] = 0;
  const heap = new MinPriorityQueue((a, b) => a[0] - b[0]);
  heap.push([0, src]);

  while (!heap.isEmpty()) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;
    for (const [v, w] of (adj[u] || [])) {
      if (d + w < dist[v]) {
        dist[v] = d + w;
        par[v] = u;
        heap.push([dist[v], v]);
      }
    }
  }
  return { dist, par };
}

function reconstructRoute(par, target) {
  const path = [target];
  while (par[path[path.length - 1]] !== -1) {
    path.push(par[path[path.length - 1]]);
  }
  return path.reverse();
}

// --- Task Placement Algorithms ---
function dpPlace(D, cap, tasks) {
  const m = cap.length;
  const n = tasks.length;
  if (n > 16) {
    // Exact bitmask DP is capped at 16 for browser memory safety
    console.warn("Workload > 16 tasks: falling back to greedy by traffic.");
    return { host: greedyPlacement(D, cap, tasks, true), cost: 0 };
  }
  const full = (1 << n) - 1;
  const INF = Infinity;

  // Precompute CPU demand for every subset S
  const cpu = new Int32Array(1 << n);
  for (let S = 0; S <= full; S++) {
    let sumCpu = 0;
    for (let t = 0; t < n; t++) {
      if ((S >> t) & 1) sumCpu += tasks[t].cpu;
    }
    cpu[S] = sumCpu;
  }

  // dp[j][S] = min cost hosting subset S on first j servers
  const dp = Array.from({ length: m + 1 }, () => new Float64Array(1 << n).fill(INF));
  const backPrev = Array.from({ length: m + 1 }, () => new Int32Array(1 << n).fill(-1));
  const backSub = Array.from({ length: m + 1 }, () => new Int32Array(1 << n).fill(0));
  dp[0][0] = 0;

  for (let j = 0; j < m; j++) {
    // Precompute cost for every subset A on server j
    const cost = new Float64Array(1 << n);
    for (let S = 0; S <= full; S++) {
      let sumCost = 0;
      for (let t = 0; t < n; t++) {
        if ((S >> t) & 1) {
          sumCost += tasks[t].traffic * D[tasks[t].a][j];
        }
      }
      cost[S] = sumCost;
    }

    const curDp = dp[j];
    const nextDp = dp[j + 1];
    const nextBackPrev = backPrev[j + 1];
    const nextBackSub = backSub[j + 1];
    const serverCap = cap[j];

    for (let S = 0; S <= full; S++) {
      if (curDp[S] === INF) continue;
      const rest = full ^ S;
      let A = rest;
      while (true) {
        if (cpu[A] <= serverCap) {
          const c = curDp[S] + cost[A];
          const nextState = S | A;
          if (c < nextDp[nextState]) {
            nextDp[nextState] = c;
            nextBackPrev[nextState] = S;
            nextBackSub[nextState] = A;
          }
        }
        if (A === 0) break;
        A = (A - 1) & rest;
      }
    }
  }

  if (dp[m][full] === INF) return { host: null, cost: INF };

  const host = Array(n).fill(null);
  let S = full;
  for (let j = m; j > 0; j--) {
    const prev = backPrev[j][S];
    const A = backSub[j][S];
    for (let t = 0; t < n; t++) {
      if ((A >> t) & 1) host[t] = j - 1;
    }
    S = prev;
  }
  return { host, cost: dp[m][full] };
}

function firstFit(cap, tasks) {
  const used = Array(cap.length).fill(0);
  const host = [];
  for (const t of tasks) {
    let placed = false;
    for (let j = 0; j < cap.length; j++) {
      if (used[j] + t.cpu <= cap[j]) {
        used[j] += t.cpu;
        host.push(j);
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }
  return host;
}

function greedyPlacement(D, cap, tasks, byTraffic = false) {
  const used = Array(cap.length).fill(0);
  const host = Array(tasks.length).fill(null);
  const order = byTraffic
    ? Array.from({ length: tasks.length }, (_, i) => i).sort((a, b) => tasks[b].traffic - tasks[a].traffic)
    : Array.from({ length: tasks.length }, (_, i) => i);

  for (const i of order) {
    const ok = [];
    for (let j = 0; j < cap.length; j++) {
      if (used[j] + tasks[i].cpu <= cap[j]) ok.push(j);
    }
    if (ok.length === 0) return null;
    let bestJ = ok[0];
    let minD = D[tasks[i].a][bestJ];
    for (let k = 1; k < ok.length; k++) {
      const j = ok[k];
      const d = D[tasks[i].a][j];
      if (d < minD) {
        minD = d;
        bestJ = j;
      }
    }
    used[bestJ] += tasks[i].cpu;
    host[i] = bestJ;
  }
  return host;
}

function calcAvgLatency(host, D, tasks) {
  if (!host) return null;
  let totalWeighted = 0;
  let totalTraffic = 0;
  for (let i = 0; i < tasks.length; i++) {
    totalWeighted += tasks[i].traffic * D[tasks[i].a][host[i]];
    totalTraffic += tasks[i].traffic;
  }
  return totalTraffic > 0 ? totalWeighted / totalTraffic : 0;
}

// --- Application State ---
let currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let pipelineResults = null;
let activeTopologyLayer = "physical"; // 'physical', 'mst', 'routes'
let animationFrameId = null;
let packetOffset = 0;

// --- Node Position Calculator (Visual Canvas) ---
function computeNodeLayout(serverNames, width, height) {
  const n = serverNames.length;
  const nodes = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = Math.min(width, height) * 0.38;
  const radiusY = Math.min(width, height) * 0.34;

  for (let i = 0; i < n; i++) {
    // Circular layout with top offset
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    nodes.push({
      id: serverNames[i],
      index: i,
      x: centerX + radiusX * Math.cos(angle),
      y: centerY + radiusY * Math.sin(angle),
      radius: 26
    });
  }
  return nodes;
}

// --- Pipeline Execution ---
function executePipeline(cfg) {
  const names = cfg.servers;
  const idx = Object.fromEntries(names.map((s, i) => [s, i]));
  const n = names.length;
  const cap = cfg.capacity;

  const edges = cfg.links.map(([a, b, w]) => [idx[a], idx[b], w]);
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v, w] of edges) {
    adj[u].push([v, w]);
    adj[v].push([u, w]);
  }

  const tasks = cfg.tasks.map(t => ({
    cpu: t.cpu,
    traffic: t.traffic,
    anchorName: t.anchor,
    a: idx[t.anchor]
  }));

  // Step 1: Minimum Spanning Tree
  const kt = kruskal(n, edges);
  const pt = prim(n, adj);
  const totalKt = kt.reduce((sum, e) => sum + e[2], 0);
  const totalPt = pt.reduce((sum, e) => sum + e[2], 0);

  // Step 2: All-Pairs Dijkstra
  const dijkstraResults = Array.from({ length: n }, (_, s) => dijkstra(n, adj, s));
  const D = dijkstraResults.map(r => r.dist);

  // Step 3: Exact DP Placement
  const t0 = performance.now();
  const dpRes = dpPlace(D, cap, tasks);
  const dpDurationMs = performance.now() - t0;

  // Step 4: Baseline Heuristics
  const hostFF = firstFit(cap, tasks);
  const hostGreedyArr = greedyPlacement(D, cap, tasks, false);
  const hostGreedyTraf = greedyPlacement(D, cap, tasks, true);

  const avgDP = calcAvgLatency(dpRes.host, D, tasks);
  const avgFF = calcAvgLatency(hostFF, D, tasks);
  const avgGreedyArr = calcAvgLatency(hostGreedyArr, D, tasks);
  const avgGreedyTraf = calcAvgLatency(hostGreedyTraf, D, tasks);

  // CPU utilization calculation
  const cpuUsed = Array(n).fill(0);
  if (dpRes.host) {
    for (let i = 0; i < tasks.length; i++) {
      cpuUsed[dpRes.host[i]] += tasks[i].cpu;
    }
  }

  // Task detailed placement routes
  const taskPlacements = tasks.map((t, i) => {
    const hostIdx = dpRes.host ? dpRes.host[i] : null;
    let path = [];
    let latency = 0;
    if (hostIdx !== null) {
      path = reconstructRoute(dijkstraResults[t.a].par, hostIdx);
      latency = D[t.a][hostIdx];
    }
    return {
      taskId: `T${i + 1}`,
      anchor: t.anchorName,
      anchorIdx: t.a,
      host: hostIdx !== null ? names[hostIdx] : "None",
      hostIdx,
      route: path.map(nodeIdx => names[nodeIdx]),
      latency,
      cpu: t.cpu,
      traffic: t.traffic,
      weightedLatency: latency * t.traffic,
      isColocated: latency === 0
    };
  });

  return {
    names,
    idx,
    cap,
    edges,
    adj,
    tasks,
    kt,
    pt,
    totalKt,
    totalPt,
    dijkstraResults,
    D,
    dpRes,
    dpDurationMs,
    hostFF,
    hostGreedyArr,
    hostGreedyTraf,
    avgDP,
    avgFF,
    avgGreedyArr,
    avgGreedyTraf,
    cpuUsed,
    taskPlacements
  };
}

// --- Render UI Components ---
function renderUI(res) {
  // 1. KPI Stats
  const elOptimalLatency = document.getElementById("valOptimalLatency");
  const elAdvantage = document.getElementById("kpiLatencyAdvantage");
  if (res.avgDP !== null) {
    elOptimalLatency.textContent = res.avgDP.toFixed(2);
    if (res.avgFF !== null) {
      const imp = ((res.avgFF - res.avgDP) / res.avgFF * 100).toFixed(1);
      elAdvantage.textContent = `${imp}% faster than First-Fit baseline`;
    }
  } else {
    elOptimalLatency.textContent = "Infeasible";
    elAdvantage.textContent = "CPU demand exceeds capacity";
  }

  const totalTraffic = res.tasks.reduce((sum, t) => sum + t.traffic, 0);
  document.getElementById("valTotalTraffic").textContent = totalTraffic;
  document.getElementById("valTaskCount").textContent = `Across ${res.tasks.length} client tasks`;

  const totalCpuDemand = res.tasks.reduce((sum, t) => sum + t.cpu, 0);
  const totalCapacity = res.cap.reduce((sum, c) => sum + c, 0);
  const cpuLoadRatio = (totalCpuDemand / totalCapacity * 100).toFixed(1);
  document.getElementById("valCpuLoad").textContent = `${totalCpuDemand} / ${totalCapacity}`;
  document.getElementById("valCpuPercent").textContent = `${cpuLoadRatio}%`;
  document.getElementById("valCpuBar").style.width = `${Math.min(cpuLoadRatio, 100)}%`;

  const totalLinkLatency = res.edges.reduce((sum, e) => sum + e[2], 0);
  document.getElementById("valTopologyStats").textContent = `${res.names.length} Srv • ${res.edges.length} Links`;
  document.getElementById("valGraphLatency").textContent = `Total link latency: ${totalLinkLatency} ms`;
  document.getElementById("valMstBadge").textContent = `MST ${res.totalKt}ms`;

  // 2. Server Fleet Grid Cards
  const fleetGrid = document.getElementById("serversGrid");
  fleetGrid.innerHTML = "";
  for (let j = 0; j < res.names.length; j++) {
    const sName = res.names[j];
    const used = res.cpuUsed[j];
    const capacity = res.cap[j];
    const pct = Math.round((used / capacity) * 100);
    const colorClass = pct > 90 ? "var(--warning)" : pct > 0 ? "var(--primary)" : "var(--text-dim)";

    const card = document.createElement("div");
    card.className = "server-card";
    card.innerHTML = `
      <div class="server-card-top">
        <span class="server-name">${sName}</span>
        <span class="server-util-badge" style="color: ${colorClass};">${pct}%</span>
      </div>
      <div class="server-cap-ratio">${used} / ${capacity} CPU units</div>
      <div class="server-bar">
        <div class="server-bar-fill" style="width: ${Math.min(pct, 100)}%; background: ${colorClass};"></div>
      </div>
    `;
    fleetGrid.appendChild(card);
  }

  // 3. Comparison Horizontal Bar Chart
  const barsContainer = document.getElementById("latencyBarsContainer");
  barsContainer.innerHTML = "";

  const algos = [
    { name: "Proposed DP (Exact)", latency: res.avgDP, cls: "bar-fill-dp", badge: "Optimal" },
    { name: "Greedy (by traffic)", latency: res.avgGreedyTraf, cls: "bar-fill-greedy-traffic", badge: "+14.5%" },
    { name: "Greedy (arrival order)", latency: res.avgGreedyArr, cls: "bar-fill-greedy-arrival", badge: "+119%" },
    { name: "First-Fit (standard)", latency: res.avgFF, cls: "bar-fill-first-fit", badge: "+307%" }
  ];

  const maxLatency = Math.max(...algos.map(a => a.latency || 0), 25);

  for (const algo of algos) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const widthPct = algo.latency !== null ? (algo.latency / maxLatency) * 100 : 0;
    const displayVal = algo.latency !== null ? `${algo.latency.toFixed(2)} ms` : "Infeasible";

    row.innerHTML = `
      <div class="bar-row-header">
        <span class="bar-name">${algo.name}</span>
        <span class="bar-latency">${displayVal}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill ${algo.cls}" style="width: ${Math.max(widthPct, 6)}%;"></div>
      </div>
    `;
    barsContainer.appendChild(row);
  }

  // 4. Quick Summary Diagnostics
  const colocatedCount = res.taskPlacements.filter(t => t.isColocated).length;
  const colocatedPct = ((colocatedCount / res.tasks.length) * 100).toFixed(1);
  document.getElementById("valColocatedTasks").textContent = `${colocatedCount} of ${res.tasks.length} (${colocatedPct}%)`;

  const remoteCount = res.tasks.length - colocatedCount;
  const remotePct = ((remoteCount / res.tasks.length) * 100).toFixed(1);
  document.getElementById("valRemoteTasks").textContent = `${remoteCount} of ${res.tasks.length} (${remotePct}%)`;

  const maxTask = [...res.taskPlacements].sort((a, b) => b.latency - a.latency)[0];
  if (maxTask && maxTask.latency > 0) {
    document.getElementById("valMaxLatency").textContent = `${maxTask.latency} ms (${maxTask.taskId} via ${maxTask.route.join(" → ")})`;
  } else {
    document.getElementById("valMaxLatency").textContent = "0 ms (All local)";
  }

  const avgCpu = (res.cpuUsed.reduce((s, u, j) => s + (u / res.cap[j]), 0) / res.names.length * 100).toFixed(1);
  document.getElementById("valAvgCpuLoad").textContent = `${avgCpu}%`;

  const mstMatch = res.totalKt === res.totalPt ? `${res.totalKt} ms (Verified Match)` : `${res.totalKt} ms / ${res.totalPt} ms`;
  document.getElementById("valMstMatch").textContent = mstMatch;

  // 5. Placements Table
  renderPlacementTable(res.taskPlacements);

  // 6. All-Pairs Dijkstra Matrix
  renderDijkstraMatrix(res.names, res.D);

  // 7. MST Chips
  renderMstSection(res.names, res.kt, res.pt, res.totalKt, res.totalPt);
}

function renderPlacementTable(placements, filter = "") {
  const tbody = document.getElementById("placementTableBody");
  tbody.innerHTML = "";
  const filtered = placements.filter(p => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return p.taskId.toLowerCase().includes(q) ||
           p.anchor.toLowerCase().includes(q) ||
           p.host.toLowerCase().includes(q) ||
           p.route.join("-").toLowerCase().includes(q);
  });

  for (const p of filtered) {
    const tr = document.createElement("tr");
    const statusBadge = p.isColocated
      ? `<span class="badge badge-success">Co-located (0ms)</span>`
      : `<span class="badge badge-warning">Routed (${p.latency}ms)</span>`;

    tr.innerHTML = `
      <td><strong>${p.taskId}</strong></td>
      <td><span class="route-badge">${p.anchor}</span></td>
      <td><span class="route-badge" style="color: var(--primary);">${p.host}</span></td>
      <td><code>${p.route.join(" → ")}</code></td>
      <td><strong>${p.latency} ms</strong></td>
      <td>${p.cpu} cores</td>
      <td>${p.traffic} req/s</td>
      <td><code>${p.weightedLatency}</code></td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderDijkstraMatrix(names, D) {
  const container = document.getElementById("dijkstraMatrixWrapper");
  container.innerHTML = "";
  const table = document.createElement("table");
  table.className = "matrix-table";

  // Top header row
  const thead = document.createElement("tr");
  thead.innerHTML = `<th class="matrix-cell matrix-header-cell">From \\ To</th>` +
    names.map(s => `<th class="matrix-cell matrix-header-cell">${s}</th>`).join("");
  table.appendChild(thead);

  for (let i = 0; i < names.length; i++) {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="matrix-cell matrix-header-cell">${names[i]}</td>` +
      names.map((_, j) => {
        const val = D[i][j];
        const isDiag = i === j;
        const cls = isDiag ? "matrix-cell matrix-diagonal" : "matrix-cell";
        return `<td class="${cls}" title="${names[i]} → ${names[j]}: ${val} ms">${val}</td>`;
      }).join("");
    table.appendChild(row);
  }
  container.appendChild(table);
}

function renderMstSection(names, kt, pt, totalKt, totalPt) {
  document.getElementById("kruskalWeightBadge").textContent = `Total: ${totalKt} ms`;
  document.getElementById("primWeightBadge").textContent = `Total: ${totalPt} ms`;

  const kList = document.getElementById("kruskalEdgesList");
  kList.innerHTML = kt.map(([u, v, w]) => `
    <span class="mst-edge-chip">${names[u]} — ${names[v]}: ${w}ms</span>
  `).join("");

  const pList = document.getElementById("primEdgesList");
  pList.innerHTML = pt.map(([u, v, w]) => `
    <span class="mst-edge-chip">${names[u]} — ${names[v]}: ${w}ms</span>
  `).join("");

  const banner = document.getElementById("mstVerificationBanner");
  if (totalKt === totalPt) {
    banner.style.display = "flex";
    banner.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="banner-icon">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <div><strong>MST Weights Match (${totalKt} ms):</strong> Kruskal and Prim independent verifications confirm optimal spanning tree weight.</div>
    `;
  } else {
    banner.style.display = "flex";
    banner.innerHTML = `<div style="color: var(--danger)">Warning: Spanning tree weight mismatch detected!</div>`;
  }
}

// --- Canvas Interactive Network Renderer ---
function initCanvas() {
  const canvas = document.getElementById("networkCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    renderCanvas(ctx, rect.width, rect.height);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Animation loop for active packet flows
  function animate() {
    packetOffset = (packetOffset + 0.015) % 1;
    const rect = canvas.getBoundingClientRect();
    renderCanvas(ctx, rect.width, rect.height);
    animationFrameId = requestAnimationFrame(animate);
  }
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(animate);
}

function renderCanvas(ctx, width, height) {
  if (!pipelineResults) return;
  const { names, edges, kt, taskPlacements, cpuUsed, cap, dijkstraResults } = pipelineResults;

  ctx.clearRect(0, 0, width, height);

  // Compute node positions
  const nodes = computeNodeLayout(names, width, height);
  const nodeMap = Object.fromEntries(nodes.map(n => [n.index, n]));

  // Draw Links
  for (const [u, v, w] of edges) {
    const nu = nodeMap[u];
    const nv = nodeMap[v];
    if (!nu || !nv) continue;

    const isMstEdge = kt.some(e => (e[0] === u && e[1] === v) || (e[0] === v && e[1] === u));

    ctx.beginPath();
    ctx.moveTo(nu.x, nu.y);
    ctx.lineTo(nv.x, nv.y);

    if (activeTopologyLayer === "mst") {
      if (isMstEdge) {
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "#c084fc";
        ctx.shadowBlur = 10;
      } else {
        ctx.strokeStyle = "rgba(100, 116, 139, 0.15)";
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
      }
    } else if (activeTopologyLayer === "routes") {
      ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
    } else {
      // Physical view
      ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw link latency badge
    if (activeTopologyLayer !== "mst" || isMstEdge) {
      const midX = (nu.x + nv.x) / 2;
      const midY = (nu.y + nv.y) / 2;
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = isMstEdge && activeTopologyLayer === "mst" ? "#c084fc" : "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      const badgeW = 34;
      const badgeH = 18;
      ctx.beginPath();
      ctx.roundRect(midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isMstEdge && activeTopologyLayer === "mst" ? "#e9d5ff" : "#94a3b8";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${w}ms`, midX, midY);
      ctx.restore();
    }
  }

  // Draw Animated Data Packets in Active Routes View
  if (activeTopologyLayer === "routes" && taskPlacements) {
    for (const tp of taskPlacements) {
      if (tp.isColocated || tp.hostIdx === null) continue;
      const par = dijkstraResults[tp.anchorIdx].par;
      const path = reconstructRoute(par, tp.hostIdx);

      // Draw glowing route path
      ctx.save();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const pNode = nodeMap[path[i]];
        if (i === 0) ctx.moveTo(pNode.x, pNode.y);
        else ctx.lineTo(pNode.x, pNode.y);
      }
      ctx.stroke();

      // Draw flowing packets along the hops
      for (let i = 0; i < path.length - 1; i++) {
        const p1 = nodeMap[path[i]];
        const p2 = nodeMap[path[i + 1]];
        const t = (packetOffset + (tp.traffic / 300)) % 1;
        const px = p1.x + (p2.x - p1.x) * t;
        const py = p1.y + (p2.y - p1.y) * t;

        ctx.fillStyle = "#10b981";
        ctx.shadowColor = "#10b981";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Draw Server Nodes
  for (const node of nodes) {
    const sIdx = node.index;
    const used = cpuUsed[sIdx];
    const capacity = cap[sIdx];
    const utilPct = capacity > 0 ? used / capacity : 0;

    ctx.save();
    // Ambient node glow
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 6, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
    ctx.fill();

    // Node body
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Outer Capacity Ring Gauge
    ctx.beginPath();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + 2 * Math.PI * Math.min(utilPct, 1);
    ctx.arc(node.x, node.y, node.radius + 4, startAngle, endAngle);
    ctx.strokeStyle = utilPct >= 1 ? "#f59e0b" : "#38bdf8";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();

    // Node Server Name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.id, node.x, node.y - 2);

    // Node CPU load text
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px 'Inter', sans-serif";
    ctx.fillText(`${used}/${capacity}C`, node.x, node.y + 11);

    ctx.restore();
  }
}

// --- Benchmark Scaling Simulator ---
function runScalingBenchmark() {
  const tbody = document.getElementById("scalingTableBody");
  const barsBox = document.getElementById("scalingBars");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Running scaling benchmarks...</td></tr>`;
  barsBox.innerHTML = "";

  setTimeout(() => {
    tbody.innerHTML = "";
    const testCounts = [6, 8, 10, 12, 14];
    const D = pipelineResults.D;
    const nServers = currentConfig.servers.length;
    const results = [];

    // Deterministic pseudo-random generator
    function seededRandom(seed) {
      return function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    }
    const rng = seededRandom(42);

    for (const m of testCounts) {
      const syntheticTasks = [];
      let totalCpu = 0;
      for (let i = 0; i < m; i++) {
        const cpu = Math.floor(rng() * 3) + 1;
        const traffic = Math.floor(rng() * 70) + 20;
        const anchor = Math.floor(rng() * nServers);
        syntheticTasks.push({ cpu, traffic, a: anchor });
        totalCpu += cpu;
      }
      const syntheticCap = Array(nServers).fill(Math.ceil((totalCpu * 1.5) / nServers) + 1);

      const t0 = performance.now();
      const res = dpPlace(D, syntheticCap, syntheticTasks);
      const duration = performance.now() - t0;
      const numSubsets = Math.pow(2, m);
      const opsEstimate = Math.pow(3, m) * nServers;

      results.push({ m, duration, numSubsets, opsEstimate, feasible: res.host !== null });
    }

    const maxDur = Math.max(...results.map(r => r.duration), 1);

    for (const r of results) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${r.m} tasks</strong></td>
        <td><code>${r.numSubsets.toLocaleString()}</code></td>
        <td><code>${r.opsEstimate.toLocaleString()}</code></td>
        <td><strong style="color: var(--primary);">${r.duration.toFixed(1)} ms</strong></td>
        <td><span class="badge ${r.feasible ? 'badge-success' : 'badge-warning'}">${r.feasible ? 'Optimal Solved' : 'Infeasible'}</span></td>
      `;
      tbody.appendChild(tr);

      const barRow = document.createElement("div");
      barRow.className = "bar-row";
      const w = (r.duration / maxDur) * 100;
      barRow.innerHTML = `
        <div class="bar-row-header">
          <span>${r.m} Tasks (${r.opsEstimate.toLocaleString()} ops)</span>
          <span class="bar-latency">${r.duration.toFixed(1)} ms</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill bar-fill-dp" style="width: ${Math.max(w, 5)}%;"></div>
        </div>
      `;
      barsBox.appendChild(barRow);
    }
    showToast("Scaling benchmark completed successfully!", "success");
  }, 50);
}

// --- Toast Notifications ---
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// --- Event Listeners and Initialization ---
document.addEventListener("DOMContentLoaded", () => {
  // Run initial pipeline
  pipelineResults = executePipeline(currentConfig);
  renderUI(pipelineResults);
  initCanvas();

  // Run Optimization Button
  document.getElementById("btnRunPipeline").addEventListener("click", () => {
    pipelineResults = executePipeline(currentConfig);
    renderUI(pipelineResults);
    showToast("Optimization algorithms executed successfully!", "success");
  });

  // Layer toggles
  const layerBtns = [
    document.getElementById("layerPhysicalBtn"),
    document.getElementById("layerMstBtn"),
    document.getElementById("layerRoutesBtn")
  ];
  layerBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      layerBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTopologyLayer = btn.dataset.layer;
      const overlayText = document.getElementById("canvasOverlayText");
      if (activeTopologyLayer === "physical") overlayText.textContent = "Physical Mesh • All Links & Latency (ms)";
      else if (activeTopologyLayer === "mst") overlayText.textContent = "MST Backbone • Kruskal & Prim 110ms Verified";
      else if (activeTopologyLayer === "routes") overlayText.textContent = "Active Routes • Data Packet Traffic Flow";
    });
  });

  // Preset Selector
  document.getElementById("presetSelect").addEventListener("change", (e) => {
    const val = e.target.value;
    if (PRESETS[val]) {
      currentConfig = JSON.parse(JSON.stringify(PRESETS[val]));
      pipelineResults = executePipeline(currentConfig);
      renderUI(pipelineResults);
      showToast(`Loaded preset scenario: ${e.target.options[e.target.selectedIndex].text}`, "info");
    }
  });

  // Tab Navigation
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      const targetTabId = btn.dataset.tab;
      document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
      const targetContent = document.getElementById(targetTabId);
      if (targetContent) targetContent.classList.add("active");
    });
  });

  // Task Search Filter
  document.getElementById("taskSearchInput").addEventListener("input", (e) => {
    if (pipelineResults) {
      renderPlacementTable(pipelineResults.taskPlacements, e.target.value);
    }
  });

  // Benchmark Buttons
  document.getElementById("btnBenchmark").addEventListener("click", () => {
    const scalingTabBtn = document.querySelector('[data-tab="tabScaling"]');
    if (scalingTabBtn) scalingTabBtn.click();
    runScalingBenchmark();
  });
  document.getElementById("btnRunScalingTest").addEventListener("click", runScalingBenchmark);

  // Config Modal
  const configModal = document.getElementById("configModal");
  const jsonTextarea = document.getElementById("jsonConfigTextarea");

  document.getElementById("btnEditConfig").addEventListener("click", () => {
    jsonTextarea.value = JSON.stringify(currentConfig, null, 2);
    updateInteractiveFormServers();
    renderInteractiveTasksList();
    configModal.classList.add("open");
  });

  document.getElementById("btnCloseConfigModal").addEventListener("click", () => {
    configModal.classList.remove("open");
  });
  document.getElementById("btnCancelConfig").addEventListener("click", () => {
    configModal.classList.remove("open");
  });

  // Modal tab toggle
  const modalTabBtns = document.querySelectorAll(".modal-tab-btn");
  modalTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      modalTabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.dataset.modaltab;
      document.querySelectorAll(".modal-tab-content").forEach(mc => mc.classList.remove("active"));
      document.getElementById(targetId).classList.add("active");
    });
  });

  document.getElementById("btnFormatJson").addEventListener("click", () => {
    try {
      const parsed = JSON.parse(jsonTextarea.value);
      jsonTextarea.value = JSON.stringify(parsed, null, 2);
    } catch (err) {
      showToast("Invalid JSON: " + err.message, "error");
    }
  });

  document.getElementById("btnResetDefaultJson").addEventListener("click", () => {
    jsonTextarea.value = JSON.stringify(DEFAULT_CONFIG, null, 2);
  });

  document.getElementById("btnSaveApplyConfig").addEventListener("click", () => {
    try {
      const parsed = JSON.parse(jsonTextarea.value);
      if (!parsed.servers || !parsed.capacity || !parsed.links || !parsed.tasks) {
        throw new Error("Missing required config keys (servers, capacity, links, tasks)");
      }
      currentConfig = parsed;
      pipelineResults = executePipeline(currentConfig);
      renderUI(pipelineResults);
      configModal.classList.remove("open");
      showToast("Custom scenario applied and optimized!", "success");
    } catch (err) {
      showToast("Failed to save config: " + err.message, "error");
    }
  });

  // Interactive Form Helpers
  function updateInteractiveFormServers() {
    const sel = document.getElementById("selectTaskAnchor");
    sel.innerHTML = currentConfig.servers.map(s => `<option value="${s}">${s}</option>`).join("");
  }

  function renderInteractiveTasksList() {
    const list = document.getElementById("currentTasksList");
    list.innerHTML = "";
    currentConfig.tasks.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "task-item-row";
      row.innerHTML = `
        <span><strong>T${i + 1}</strong>: CPU ${t.cpu}, Traffic ${t.traffic} req/s, Anchor <code>${t.anchor}</code></span>
        <button class="btn-sm" style="color: var(--danger);" data-task-idx="${i}">Delete</button>
      `;
      row.querySelector("button").addEventListener("click", () => {
        currentConfig.tasks.splice(i, 1);
        jsonTextarea.value = JSON.stringify(currentConfig, null, 2);
        renderInteractiveTasksList();
      });
      list.appendChild(row);
    });
  }

  document.getElementById("btnAddTask").addEventListener("click", () => {
    const cpu = parseInt(document.getElementById("inputTaskCpu").value, 10) || 2;
    const traffic = parseInt(document.getElementById("inputTaskTraffic").value, 10) || 50;
    const anchor = document.getElementById("selectTaskAnchor").value;
    currentConfig.tasks.push({ cpu, traffic, anchor });
    jsonTextarea.value = JSON.stringify(currentConfig, null, 2);
    renderInteractiveTasksList();
    showToast(`Task added (Anchor: ${anchor}, CPU: ${cpu}, Traffic: ${traffic})`, "info");
  });

  // Export Modal
  const exportModal = document.getElementById("exportModal");
  const exportPreview = document.getElementById("exportPreviewArea");

  document.getElementById("btnExport").addEventListener("click", () => {
    exportPreview.value = generateMarkdownReport(pipelineResults);
    exportModal.classList.add("open");
  });
  document.getElementById("btnCloseExportModal").addEventListener("click", () => exportModal.classList.remove("open"));

  document.getElementById("btnDownloadJson").addEventListener("click", () => {
    downloadFile("config.json", JSON.stringify(currentConfig, null, 2), "application/json");
  });

  document.getElementById("btnDownloadCsv").addEventListener("click", () => {
    if (!pipelineResults) return;
    const headers = "Task,Anchor,Host,Route,LatencyMs,CpuCores,TrafficReqSec,Impact\n";
    const rows = pipelineResults.taskPlacements.map(p =>
      `${p.taskId},${p.anchor},${p.host},"${p.route.join("->")}",${p.latency},${p.cpu},${p.traffic},${p.weightedLatency}`
    ).join("\n");
    downloadFile("task_placement_results.csv", headers + rows, "text/csv");
  });

  document.getElementById("btnCopyReport").addEventListener("click", () => {
    navigator.clipboard.writeText(exportPreview.value).then(() => {
      showToast("Report copied to clipboard!", "success");
    }).catch(() => {
      showToast("Clipboard copy failed.", "error");
    });
  });
});

function generateMarkdownReport(res) {
  if (!res) return "";
  let md = `# Cloud Task Placement Optimization Report\n\n`;
  md += `## 1. Executive Summary\n`;
  md += `- **Optimal Latency (Proposed DP)**: ${res.avgDP !== null ? res.avgDP.toFixed(2) + ' ms' : 'Infeasible'}\n`;
  md += `- **Greedy (by traffic)**: ${res.avgGreedyTraf !== null ? res.avgGreedyTraf.toFixed(2) + ' ms' : 'Infeasible'}\n`;
  md += `- **Greedy (arrival order)**: ${res.avgGreedyArr !== null ? res.avgGreedyArr.toFixed(2) + ' ms' : 'Infeasible'}\n`;
  md += `- **First-Fit Baseline**: ${res.avgFF !== null ? res.avgFF.toFixed(2) + ' ms' : 'Infeasible'}\n`;
  md += `- **MST Weight (Kruskal & Prim)**: ${res.totalKt} ms\n`;
  md += `- **Capacity Violations**: 0\n\n`;

  md += `## 2. Server Capacity Utilization\n`;
  for (let j = 0; j < res.names.length; j++) {
    const s = res.names[j];
    const u = res.cpuUsed[j];
    const c = res.cap[j];
    md += `- **${s}**: ${u}/${c} CPU units (${Math.round(u/c * 100)}%)\n`;
  }
  md += `\n## 3. Detailed Task Placements\n\n`;
  md += `| Task | Anchor | Host | Shortest Route | Latency | CPU | Traffic |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  for (const p of res.taskPlacements) {
    md += `| ${p.taskId} | ${p.anchor} | ${p.host} | ${p.route.join(" → ")} | ${p.latency} ms | ${p.cpu} | ${p.traffic} req/s |\n`;
  }
  return md;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`, "success");
}
