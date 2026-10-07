"""
Cloud Task Placement - latency-aware VM/replica placement
Pipeline: latency graph -> MST (Kruskal + Prim) -> Dijkstra (all pairs) -> capacity-aware DP.

Run:   python cloud_task_placement.py                 (built-in example from the report)
       python cloud_task_placement.py config.json     (your own servers / links / tasks)
       python cloud_task_placement.py --scaling       (runtime tests)
"""
import heapq, json, sys, time, random

# ---------------- default example (same as the report) ----------------
DEFAULT = {
    "servers": ["S1", "S2", "S3", "S4", "S5", "S6"],
    "capacity": [6, 6, 6, 4, 6, 6],                       # CPU units per server
    "links": [["S1","S2",20],["S1","S4",25],["S1","S3",35],["S2","S4",15],["S4","S3",30],
              ["S2","S5",25],["S3","S6",20],["S5","S6",30],["S4","S6",40]],   # latency in ms
    "tasks": [                                            # cpu = CPU needed, traffic = requests/s,
        {"cpu":2,"traffic":20,"anchor":"S4"}, {"cpu":2,"traffic":30,"anchor":"S4"},   # anchor = where users/data are
        {"cpu":2,"traffic":25,"anchor":"S2"}, {"cpu":2,"traffic":90,"anchor":"S4"},
        {"cpu":3,"traffic":85,"anchor":"S2"}, {"cpu":2,"traffic":40,"anchor":"S1"},
        {"cpu":3,"traffic":75,"anchor":"S4"}, {"cpu":2,"traffic":35,"anchor":"S3"},
        {"cpu":3,"traffic":60,"anchor":"S2"}, {"cpu":2,"traffic":50,"anchor":"S5"},
        {"cpu":3,"traffic":45,"anchor":"S6"}]
}

# ---------------- graph algorithms ----------------
def kruskal(n, edges):
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    tree = []
    for u, v, w in sorted(edges, key=lambda e: e[2]):
        a, b = find(u), find(v)
        if a != b: parent[a] = b; tree.append((u, v, w))
    return tree

def prim(n, adj):
    seen = {0}; heap = [(w, 0, v) for v, w in adj[0]]; heapq.heapify(heap); tree = []
    while heap and len(seen) < n:
        w, u, v = heapq.heappop(heap)
        if v in seen: continue
        seen.add(v); tree.append((u, v, w))
        for x, ww in adj[v]:
            if x not in seen: heapq.heappush(heap, (ww, v, x))
    return tree

def dijkstra(n, adj, src):
    dist = [float("inf")] * n; par = [-1] * n; dist[src] = 0; heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]: continue
        for v, w in adj[u]:
            if d + w < dist[v]: dist[v] = d + w; par[v] = u; heapq.heappush(heap, (dist[v], v))
    return dist, par

def route(par, t):
    p = [t]
    while par[p[-1]] != -1: p.append(par[p[-1]])
    return p[::-1]

# ---------------- capacity-aware DP (exact) ----------------
def dp_place(D, cap, tasks):
    """dp[j][S] = min cost of hosting task-subset S on the first j servers."""
    m, n = len(cap), len(tasks); full = (1 << n) - 1; INF = float("inf")
    cpu = [sum(tasks[t]["cpu"] for t in range(n) if S >> t & 1) for S in range(1 << n)]
    dp = [[INF] * (1 << n) for _ in range(m + 1)]; back = [[None] * (1 << n) for _ in range(m + 1)]
    dp[0][0] = 0
    for j in range(m):
        cost = [sum(tasks[t]["traffic"] * D[tasks[t]["a"]][j] for t in range(n) if S >> t & 1) for S in range(1 << n)]
        for S in range(1 << n):
            if dp[j][S] == INF: continue
            rest = full ^ S; A = rest
            while True:                                   # enumerate every subset A of the remaining tasks
                if cpu[A] <= cap[j]:
                    c = dp[j][S] + cost[A]
                    if c < dp[j + 1][S | A]: dp[j + 1][S | A] = c; back[j + 1][S | A] = (S, A)
                if A == 0: break
                A = (A - 1) & rest
    if dp[m][full] == INF: return None, INF               # no feasible placement
    host = [None] * n; S = full
    for j in range(m, 0, -1):
        prev, A = back[j][S]
        for t in range(n):
            if A >> t & 1: host[t] = j - 1
        S = prev
    return host, dp[m][full]

def first_fit(cap, tasks):
    used = [0] * len(cap); host = []
    for t in tasks:
        for j in range(len(cap)):
            if used[j] + t["cpu"] <= cap[j]: used[j] += t["cpu"]; host.append(j); break
        else: return None
    return host

def greedy(D, cap, tasks, by_traffic=False):
    used = [0] * len(cap); host = [None] * len(tasks)
    order = sorted(range(len(tasks)), key=lambda i: -tasks[i]["traffic"]) if by_traffic else range(len(tasks))
    for i in order:
        ok = [j for j in range(len(cap)) if used[j] + tasks[i]["cpu"] <= cap[j]]
        if not ok: return None
        j = min(ok, key=lambda j: D[tasks[i]["a"]][j]); used[j] += tasks[i]["cpu"]; host[i] = j
    return host

def avg_latency(host, D, tasks):
    return sum(t["traffic"] * D[t["a"]][h] for t, h in zip(tasks, host)) / sum(t["traffic"] for t in tasks)

# ---------------- main program ----------------
def run(cfg):
    names = cfg["servers"]; idx = {s: i for i, s in enumerate(names)}; n = len(names); cap = cfg["capacity"]
    edges = [(idx[a], idx[b], w) for a, b, w in cfg["links"]]
    adj = {i: [] for i in range(n)}
    for u, v, w in edges: adj[u].append((v, w)); adj[v].append((u, w))
    tasks = [{"cpu": t["cpu"], "traffic": t["traffic"], "a": idx[t["anchor"]]} for t in cfg["tasks"]]

    print(f"[1] Graph: {n} servers, {len(edges)} links, total link latency = {sum(e[2] for e in edges)} ms")
    kt = kruskal(n, edges); pt = prim(n, adj)
    print("[2] MST (Kruskal): " + " ".join(f"{names[u]}-{names[v]}:{w}" for u, v, w in kt) + f" | total = {sum(e[2] for e in kt)} ms")
    print(f"    MST (Prim)   : total = {sum(e[2] for e in pt)} ms  -> " + ("weights match" if sum(e[2] for e in kt) == sum(e[2] for e in pt) else "MISMATCH"))
    res = [dijkstra(n, adj, s) for s in range(n)]; D = [r[0] for r in res]
    print(f"[3] Dijkstra: all-pairs shortest latency computed ({n} sources)")
    print(f"[4] DP placement: {len(tasks)} tasks, {n} servers, capacity = {cap}")
    host, cost = dp_place(D, cap, tasks)
    if host is None: print("    No feasible placement: total CPU demand exceeds capacity."); return
    print("    Task  Anchor  Host  Route        Latency")
    for i, t in enumerate(tasks):
        p = route(res[t["a"]][1], host[i])
        print(f"    T{i+1:<4} {names[t['a']]:<7} {names[host[i]]:<5} {'-'.join(names[x] for x in p):<12} {D[t['a']][host[i]]:>3} ms")
    used = [sum(t["cpu"] for t, h in zip(tasks, host) if h == j) for j in range(n)]
    print(f"[5] Average latency (traffic-weighted): {avg_latency(host, D, tasks):.2f} ms")
    print("    Capacity violations: 0 | CPU utilisation: " + " ".join(f"{names[j]}={used[j]/cap[j]*100:.0f}%" for j in range(n)))
    print("\nBaselines (same workload):")
    for label, h in [("First-fit", first_fit(cap, tasks)), ("Greedy (arrival order)", greedy(D, cap, tasks)),
                     ("Greedy (by traffic)", greedy(D, cap, tasks, True)), ("DP (proposed)", host)]:
        print(f"    {label:<24}", "infeasible" if h is None else f"{avg_latency(h, D, tasks):.2f} ms")

def scaling():
    D = None
    print("DP runtime vs number of tasks (6 servers):")
    cfg = DEFAULT; idx = {s: i for i, s in enumerate(cfg["servers"])}; n = 6
    adj = {i: [] for i in range(n)}
    for a, b, w in cfg["links"]: adj[idx[a]].append((idx[b], w)); adj[idx[b]].append((idx[a], w))
    D = [dijkstra(n, adj, s)[0] for s in range(n)]; r = random.Random(3)
    for m in (6, 8, 10, 12):
        tk = [{"cpu": r.choice([1, 2, 2, 3]), "traffic": r.randint(20, 90), "a": r.randrange(n)} for _ in range(m)]
        cp = [int(sum(t["cpu"] for t in tk) * 1.5 / n) + 1] * n
        t0 = time.perf_counter(); dp_place(D, cp, tk); print(f"    {m:>2} tasks: {(time.perf_counter()-t0)*1000:8.1f} ms")

if __name__ == "__main__":
    if "--scaling" in sys.argv: scaling()
    else:
        cfg = DEFAULT
        if len(sys.argv) > 1: cfg = json.load(open(sys.argv[1]))
        run(cfg)
