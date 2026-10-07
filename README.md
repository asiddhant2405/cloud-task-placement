# Cloud Task Placement

> **Latency-Aware VM & Replica Placement Optimization Engine**  
> Powered by Graph Theory, Minimum Spanning Trees (Kruskal & Prim), All-Pairs Dijkstra, and Exact Capacity-Aware Dynamic Programming.

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-black?style=flat&logo=vercel)](https://vercel.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)

---

## 🌟 Overview

In modern multi-region cloud infrastructures and edge computing architectures, determining where to place virtual machine replicas, containerized microservices, or computation tasks is a fundamental trade-off between **network latency** and **server compute capacity**.

This project provides an end-to-end framework and interactive visual dashboard to solve latency-aware task placement:
1. **Network Latency Topology Graph**: Models distributed cloud servers and communication link latencies in milliseconds.
2. **Minimum Spanning Tree (MST)**: Cross-verified using both **Kruskal's Algorithm** (Disjoint Set Union) and **Prim's Algorithm** (Min-Heap Priority Queue).
3. **All-Pairs Shortest Path**: Evaluated via **Dijkstra's Algorithm** with predecessor tracking for hop-by-hop route reconstruction.
4. **Exact Capacity-Aware Dynamic Programming Solver**: An exact bitmask subset-enumeration solver that guarantees global optimality without capacity violations.
5. **Heuristic Baselines**: Comparative evaluation against **First-Fit**, **Greedy (Arrival Order)**, and **Greedy (by Traffic Volume)**.

---

## 📊 Benchmark & Comparative Results

Using the standard 6-server, 11-task heterogeneous cloud cluster:

| Placement Strategy | Traffic-Weighted Latency | Latency vs Optimal DP | Violations | Time Complexity |
|---|---|---|---|---|
| **Proposed DP (Exact)** | **5.59 ms** | **0.00% (Baseline Optimal)** | **0** | $O(3^N \cdot M)$ |
| **Greedy (by Traffic)** | 6.40 ms | +14.5% overhead | 0 | $O(N \log N + N \cdot M)$ |
| **Greedy (Arrival Order)**| 12.25 ms | +119.1% overhead | 0 | $O(N \cdot M)$ |
| **First-Fit (Standard)** | 22.79 ms | +307.7% overhead | 0 | $O(N \cdot M)$ |

### Server Capacity Utilization (Optimal DP)
- **S1**: 5 / 6 CPU units (83%)
- **S2**: 6 / 6 CPU units (100%)
- **S3**: 4 / 6 CPU units (67%)
- **S4**: 4 / 4 CPU units (100%)
- **S5**: 4 / 6 CPU units (67%)
- **S6**: 3 / 6 CPU units (50%)
- **Overall**: 26 / 34 CPU units (76.5% fleet load, 0 capacity violations)

---

## 📐 Mathematical Formulation

Given $m$ servers $V = \{S_1, \dots, S_m\}$ with capacities $C_j$, shortest latency matrix $D[u][v]$, and $n$ tasks $T = \{t_1, \dots, t_n\}$ where each task has CPU demand $c_i$, traffic $\lambda_i$, and client anchor $a_i$:

$$\min_{x} \quad \frac{\sum_{i=1}^n \lambda_i \cdot D[a_i][x_i]}{\sum_{i=1}^n \lambda_i} \quad \text{subject to} \quad \sum_{i: x_i = j} c_i \le C_j \quad \forall j \in \{1,\dots,m\}$$

### Dynamic Programming Transition
Let $dp[j][S]$ be the minimum cost of hosting task subset $S \subseteq \{1,\dots,n\}$ across the first $j$ servers:

$$dp[j+1][S \cup A] = \min \left\{ dp[j+1][S \cup A], \; dp[j][S] + \text{cost}_j(A) \right\}$$

Where $A \subseteq (\text{full} \setminus S)$ is any valid subset of unassigned tasks satisfying $\sum_{t \in A} c_t \le C_j$.

Using submask enumeration `A = (A - 1) & rest`, the algorithm traverses all submasks in $\sum_{k=0}^n \binom{n}{k} 2^{n-k} = 3^n$ iterations per server.

---

## 🚀 Getting Started

### 1. Run the Python CLI

```bash
# Run the built-in benchmark
python cloud_task_placement.py

# Run with custom JSON configuration
python cloud_task_placement.py config.json

# Run runtime scaling tests
python cloud_task_placement.py --scaling
```

### 2. Run the Interactive Web Application

Open `index.html` directly in any modern browser, or launch a local server:

```bash
npm start
# or
npx serve .
```

---

## 🛠️ Features of the Web Application

- **Interactive Network Visualizer**: Real-time canvas rendering nodes with capacity ring gauges, links with latencies, MST highlights, and animated data packet flows along active task routes.
- **Dynamic Scenario Playground**: Switch presets, add/remove tasks, modify server capacities, and tweak link latencies with live re-optimization.
- **Matrix Inspector**: Interactive $N \times N$ Dijkstra latency heatmap with route tooltips.
- **MST Comparison**: Step-by-step edge breakdown for Kruskal and Prim algorithms.
- **Live Scaling Benchmark**: In-browser execution of the exact solver across workload scales ($N = 6, 8, 10, 12, 14$).
- **Export Engine**: Export full optimization reports in JSON, CSV, or formatted Markdown.

---

## 📄 License

MIT License. Designed and developed for latency-aware cloud infrastructure simulation.
